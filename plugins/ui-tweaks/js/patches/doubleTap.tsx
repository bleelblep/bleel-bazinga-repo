/**
 * Double-tap a message: any of the swipe actions (lib/actions.ts), chosen separately for your own
 * messages and others'. Grew out of a reply/edit switch (Better Chat Gestures' idea, by Rosie,
 * Unlicense; written fresh here).
 *
 * Wraps `MessagesHandlers.handleDoubleTapMessage` through lib/handlers.ts, which explains how the
 * instances are caught on 350.2 and 350.4. Reply and edit go to the ORIGINAL
 * `handleInitiateReply`/`handleInitiateEdit`, not the instance's current ones: those may be the
 * swipe tweak's wrappers (patches/swipe.ts), which would treat a double-tap as a swipe.
 *
 * Discord's own double-tap (`handleAddDefaultDoubleTapReaction`) runs for `stock`, and when the
 * message can't be resolved.
 */

import { isOwn, runSwipeAction, targetOf } from '../lib/actions'
import { originalHandler, wrapHandler } from '../lib/handlers'
import { settings } from '../lib/state'
import { reportError } from '../../../../shared/report'

const TAG = '[UITweaks]'

export default (): (() => void) =>
	wrapHandler('handleDoubleTapMessage', (instance, original) =>
		function handleDoubleTapMessage(this: unknown, event: any) {
			try {
				const s = settings()
				if (s.doubleTapOwn !== 'stock' || s.doubleTapOthers !== 'stock') {
					const target = targetOf(instance, event)
					if (target.message) {
						const action = isOwn(target.message) ? s.doubleTapOwn : s.doubleTapOthers
						if (action !== 'stock') {
							const reply = originalHandler(instance, 'handleInitiateReply') ?? instance.handleInitiateReply
							const edit = originalHandler(instance, 'handleInitiateEdit') ?? instance.handleInitiateEdit
							return runSwipeAction(action, 'doubleTap', { ...target, reply, edit }, s)
						}
					}
				}
			} catch (error) {
				reportError(`${TAG} double-tap failed:`, error)
			}
			return original.call(this, event)
		},
	)
