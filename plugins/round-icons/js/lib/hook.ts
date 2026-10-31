/**
 * Hooks one component's render, whatever shape Discord exported it in: a plain function, a
 * `memo(fn)` (350.2 dropped forwardRef app-wide, so `.type.render` is gone), or a `forwardRef`
 * on older builds. Found by module path, which survives minified builds (349.5+).
 */

import { getModuleByPath } from '../../../../shared/modules'
import { reportError } from '../../../../shared/report'
import { after, before } from '@valenced/patcher'

const TAG = '[Round Corners]'

export type HookStatus = 'waiting' | 'hooked' | 'failed'
/** Per module path: whether its component has been found and hooked, for the settings page. */
export const hookStatus = new Map<string, { status: HookStatus; detail?: string }>()
const statusListeners = new Set<() => void>()
function setStatus(path: string, status: HookStatus, detail?: string) {
	hookStatus.set(path, { status, detail })
	for (const listener of statusListeners) listener()
}
export function onHookStatus(listener: () => void): () => void {
	statusListeners.add(listener)
	return () => {
		statusListeners.delete(listener)
	}
}

function renderTarget(exported: any): [any, string] | undefined {
	if (typeof exported === 'function') return undefined // handled by the caller: patch the namespace key
	if (typeof exported?.type === 'function') return [exported, 'type']
	if (typeof exported?.render === 'function') return [exported, 'render']
	if (typeof exported?.type?.render === 'function') return [exported.type, 'render']
	return undefined
}

/**
 * After-hooks the render of `exportName` on the module at `path`; `wrap` gets the rendered tree and
 * the props and returns the tree to use. Returns a cleanup.
 */
export function hookRender(path: string, exportName: string, wrap: (tree: any, props: any) => any): () => void {
	const cleanups: Array<() => void> = []
	setStatus(path, 'waiting')
	cleanups.push(
		getModuleByPath(
			path,
			null,
			(ns: any) => {
				const exported = ns?.[exportName]
				const direct = typeof exported === 'function'
				const target = direct ? [ns, exportName] : renderTarget(exported)
				if (!target) {
					setStatus(path, 'failed', `${exportName} is not a component`)
					throw new Error(`${path}: ${exportName} is not a component`)
				}
				setStatus(path, 'hooked', direct ? 'function' : target[1] === 'type' ? 'memo' : 'forwardRef')
				// Valenced's `after` gets only the result, so the props come from a `before` on the same
				// render (synchronous, so the pair always matches).
				let props: any
				cleanups.push(
					before(target[0], target[1], (args: any[]) => {
						props = args?.[0]
						return args // a before-hook must return the args array
					}),
					after(target[0], target[1], (tree: any) => {
						try {
							return wrap(tree, props)
						} catch (error) {
							reportError(`${TAG} ${path} failed:`, error)
							return tree
						}
					}),
				)
			},
			TAG,
		),
	)
	return () => {
		for (const cleanup of cleanups.splice(0).reverse()) {
			try {
				cleanup()
			} catch {
				/* already gone */
			}
		}
	}
}
