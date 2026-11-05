/**
 * Hides the Message Requests entry in the DM list.
 *
 * The button is `modules/main_tabs_v2/native/shared_components/MessageRequestsButton.tsx`, a plain
 * function on 350.4 (0.1.x wrapped it with wrapRender, which needs a memo, so nothing happened).
 * Its only importer is `modules/main_tabs_v2/native/tabs/messages/MessagesHeader.tsx` (memo(fn)),
 * found through the module dependency graph on 350.4. That header's render is wrapped, and every
 * element of the button's type is taken out of what it returns. The header is mounted once with
 * the tab, so a change shows after the next restart or tab remount.
 */

import { wrapRender } from '../../../../shared/wrapRender'
import { findModule } from '../lib/find'
import { settings } from '../lib/state'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const BUTTON = 'modules/main_tabs_v2/native/shared_components/MessageRequestsButton.tsx'
const HEADER = 'modules/main_tabs_v2/native/tabs/messages/MessagesHeader.tsx'
const TAG = '[UITweaks]'

let button: unknown
let warned = false

/** Removes every element of the button's type from [node]'s children, in place. Returns the count. */
function strip(node: any, depth = 0): number {
	if (!node || typeof node !== 'object' || depth > 20) return 0
	if (Array.isArray(node)) {
		let removed = 0
		for (let i = node.length - 1; i >= 0; i--) {
			if (node[i]?.type === button) {
				node.splice(i, 1)
				removed++
			} else {
				removed += strip(node[i], depth + 1)
			}
		}
		return removed
	}
	const children = node.props?.children
	if (children?.type === button) {
		node.props.children = null
		return 1
	}
	return strip(children, depth + 1)
}

export default (): (() => void) => {
	const undo: Array<() => void> = []
	undo.push(
		findModule(BUTTON, null, (mod: any) => {
			button = mod?.default
		}),
	)
	undo.push(
		findModule(HEADER, null, (exports: any) => {
			const restore = wrapRender(exports, original => function (this: unknown, ...args: any[]) {
				const tree = Reflect.apply(original, this, args)
				try {
					if (!settings().hideMessageRequests || !button) return tree
					if (tree?.type === button) return null
					if (!strip(tree) && !warned) {
						warned = true
						if (DEBUG) console.warn(`${TAG} Message Requests: the button isn't in MessagesHeader's own render on this build`)
					}
				} catch (error) {
					reportError(`${TAG} hiding Message Requests failed:`, error)
				}
				return tree
			})
			if (restore) undo.push(restore)
			else reportError(`${TAG} MessagesHeader has an unknown component shape`)
		}),
	)
	return () => {
		for (const fn of undo.reverse()) {
			try {
				fn()
			} catch {
				/* already gone */
			}
		}
	}
}
