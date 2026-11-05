/**
 * Hides the quick reaction bar.
 *
 * The bar itself is native — there is no JS component for it (verified against the bundle: the
 * burst-reaction modules are the super-reaction animations, and `handleTapMessage` only handles
 * boost-upsell/flagged-message taps). What JS does feed it is the per-row accessibility action
 * list: `modules/messages/native/MessageAccessibilityActions.tsx` builds entries like REPLY,
 * ADD_QUICK_REACTION and MESSAGE_ACTIONS_MENU into the row data the native side renders. With the
 * toggle on, the quick-reaction entry is filtered out of that list.
 *
 * If the bar on some build turns out not to read this list, the row-level action data is the next
 * lever (`createMessageContent`); both are data edits, not render patches.
 */

import { findModule } from '../lib/find'
import { settings } from '../lib/state'
import { reportError } from '../../../../shared/report'

const ACCESSIBILITY = 'modules/messages/native/MessageAccessibilityActions.tsx'
const TAG = '[UITweaks]'

const QUICK_REACTION = 'ADD_QUICK_REACTION'

export default (): (() => void) => {
	// Not stored on `undo`: the callback runs before findModule returns when the module is loaded.
	let restore: (() => void) | undefined
	const undo = findModule(ACCESSIBILITY, ['createMessageAccessibilityActions'], (mod: any) => {
		const host = typeof mod?.createMessageAccessibilityActions === 'function' ? mod : mod?.default
		if (!host || typeof host.createMessageAccessibilityActions !== 'function') {
			reportError(`${TAG} createMessageAccessibilityActions is not a function on this build`)
			return
		}
		const original = host.createMessageAccessibilityActions
		const wrapper = function (this: unknown, ...args: any[]) {
			const ret = Reflect.apply(original, this, args)
			try {
				if (!settings().hideReactionBar) return ret
				if (!Array.isArray(ret)) return ret
				return ret.filter(
					(entry: any) => typeof entry !== 'object' || entry == null || entry.label !== QUICK_REACTION,
				)
			} catch (error) {
				reportError(`${TAG} reaction bar filter failed:`, error)
				return ret
			}
		}
		host.createMessageAccessibilityActions = wrapper
		restore = () => {
			if (host.createMessageAccessibilityActions === wrapper) host.createMessageAccessibilityActions = original
		}
	})
	return () => {
		restore?.()
		restore = undefined
		undo()
	}
}
