import * as patcher from '@valenced/patcher'
import { reportError } from '../../../../shared/report'

/** Patch every callable slot, including a module's separate default helper object. */
export function resolverHosts(mod: any, key: string): any[] {
	return [...new Set([mod, mod?.default])].filter(
		host => typeof host?.[key] === 'function',
	)
}

/**
 * A slot, not a function, is the unit of patching. Two exports can initially reference the same
 * function while callers read them through different objects; patching one leaves the other raw.
 */
export class ResolverSlots {
	private readonly slots = new WeakMap<object, Set<string>>()

	has(host: object, key: string): boolean {
		return this.slots.get(host)?.has(key) ?? false
	}

	add(host: object, key: string) {
		let keys = this.slots.get(host)
		if (!keys) this.slots.set(host, (keys = new Set()))
		keys.add(key)
	}
}

/** Pair synchronous calls even when a resolver invokes itself through another export. */
export function patchResolver<T>(
	host: any,
	key: string,
	subject: (args: any[]) => T,
	transform: (result: any, subject: T | undefined) => any,
): () => void {
	const stack: Array<T | undefined> = []
	const before = patcher.before(host, key, (args: any[]) => {
		if (stack.length >= 32) stack.length = 0
		try {
			stack.push(subject(args))
		} catch {
			stack.push(undefined)
		}
		return args
	})
	let after: () => void
	try {
		after = patcher.after(host, key, (result: any) => {
			const call = stack.pop()
			try {
				return transform(result, call)
			} catch (error) {
				reportError(`[ScreenshotRedactor] ${key} failed:`, error)
				return result
			}
		})
	} catch (error) {
		before()
		throw error
	}
	return () => {
		after()
		before()
		stack.length = 0
	}
}
