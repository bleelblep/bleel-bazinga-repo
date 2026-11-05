/**
 * Wraps chat handlers on Discord's `MessagesHandlers` instances, for every tweak that needs one
 * (double-tap, the two swipe stages). One set of traps for all of them, so tweaks don't stack
 * their own and wrap each other.
 *
 * `modules/messages/native/MessagesHandlers.tsx` exports `MessagesHandlers`, a function-style class
 * whose constructor builds every chat handler as an own property. Two levers, kept from the
 * double-tap patch (0.3.4, proven on 350.4):
 *
 * - **Setter trap** on the prototype, for builds whose constructor assigns via [[Set]]
 *   (`self.handleX = fn`, 350.2).
 * - **`params` read**: `params` is a real prototype accessor the constructor never reads; every read
 *   comes later from the chat rows, after every handler exists. On builds whose constructor uses
 *   `Object.defineProperty` (350.4), which skips prototype setters, this is the one that works.
 *
 * Each wrapped handler is marked per key, so neither lever wraps twice (wrapping a wrapper would
 * recurse on every call). The instance is built at chat mount and survives channel switches, so a
 * wrapper registered later only reaches instances built after it (UI Tweaks needs a restart anyway).
 */

import { findModule } from './find'
import { reportError } from '../../../../shared/report'

const HANDLERS = 'modules/messages/native/MessagesHandlers.tsx'
const TAG = '[UITweaks]'

export type HandlerWrapper = (instance: any, original: (...args: any[]) => unknown) => (...args: any[]) => unknown

const wrappers = new Map<string, HandlerWrapper>()
const markOf = (key: string) => `__uitweaks_wrapped_${key}`

/** The original handlers, per instance and key: tweaks call each other's originals through this. */
const originals = new WeakMap<object, Record<string, (...args: any[]) => unknown>>()

export function originalHandler(instance: any, key: string): ((...args: any[]) => unknown) | undefined {
	return originals.get(instance)?.[key]
}

function ensureWrapped(instance: any, key: string, value: unknown): void {
	const wrapper = wrappers.get(key)
	if (!instance || !wrapper || instance[markOf(key)]) return
	if (typeof value !== 'function') value = Object.getOwnPropertyDescriptor(instance, key)?.value
	if (typeof value !== 'function') return
	instance[markOf(key)] = true
	const record = originals.get(instance) ?? {}
	record[key] = value as any
	originals.set(instance, record)
	Object.defineProperty(instance, key, {
		value: wrapper(instance, value as any),
		writable: true,
		configurable: true,
		enumerable: true,
	})
}

let installed: { restore: () => void } | undefined
let scheduled = false

/** One microtask later, so every tweak registering in the same start() gets a setter trap. */
function install() {
	if (installed || scheduled) return
	scheduled = true
	Promise.resolve().then(() => {
		scheduled = false
		if (wrappers.size && !installed) installNow()
	})
}

function installNow() {
	const restores: Array<() => void> = []
	const undo = findModule(HANDLERS, ['MessagesHandlers'], (mod: any) => {
		const proto = mod?.MessagesHandlers?.prototype
		if (!proto) {
			reportError(`${TAG} MessagesHandlers has no prototype on this build`)
			return
		}
		for (const key of wrappers.keys()) {
			if (Object.getOwnPropertyDescriptor(proto, key)) continue
			Object.defineProperty(proto, key, {
				configurable: true,
				set(this: any, value: unknown) {
					ensureWrapped(this, key, value)
					// A key nobody wraps any more still has to land on the instance.
					if (!wrappers.has(key)) Object.defineProperty(this, key, { value, writable: true, configurable: true, enumerable: true })
				},
				get() {
					return undefined
				},
			})
			restores.push(() => {
				delete proto[key]
			})
		}
		const paramsDesc = Object.getOwnPropertyDescriptor(proto, 'params')
		if (paramsDesc?.get) {
			const originalGet = paramsDesc.get
			Object.defineProperty(proto, 'params', {
				configurable: true,
				get(this: any) {
					if (this !== proto) for (const key of wrappers.keys()) ensureWrapped(this, key, undefined)
					return originalGet.call(this)
				},
			})
			restores.push(() => {
				Object.defineProperty(proto, 'params', paramsDesc)
			})
		} else {
			reportError(`${TAG} MessagesHandlers.params has no getter; chat handler tweaks rely on the setter trap alone`)
		}
	})
	installed = {
		restore: () => {
			for (const restore of restores.splice(0)) {
				try {
					restore()
				} catch {
					/* already gone */
				}
			}
			undo()
		},
	}
}

/**
 * Wraps `MessagesHandlers` instances' [key] handler with [wrapper]. Returns an unregister; the
 * traps go once nothing is registered.
 */
export function wrapHandler(key: string, wrapper: HandlerWrapper): () => void {
	wrappers.set(key, wrapper)
	install()
	return () => {
		if (wrappers.get(key) === wrapper) wrappers.delete(key)
		if (!wrappers.size && installed) {
			installed.restore()
			installed = undefined
		}
	}
}
