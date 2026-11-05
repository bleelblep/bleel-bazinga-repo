/**
 * Customisable message swipes (traced in 350.4, alpha 350204, hermes-dec):
 *
 * - Which stages a message has: the row generator asks
 *   `modules/messages/native/renderer/RowGeneratorUtils.tsx` `createSwipeActions(enabled, canEdit)`,
 *   which returns `SwipeActionsType` (`RowGeneratorConstants.tsx`): `NONE`, `REPLY` (one stage) or
 *   `REPLY_EDIT` (a short and a further swipe; Discord gives it to messages you can edit). With
 *   "every message" on, it returns `REPLY_EDIT` whenever swipes are enabled, so others' messages get
 *   the further stage too. The native list draws the stage icons from the row (see patchIcons):
 *   each stage shows its action's icon.
 * - What a stage does: the native list fires `topInitiateReply` (short) / `topInitiateEdit` (further),
 *   which reach `MessagesHandlers.handleInitiateReply` / `handleInitiateEdit` (only swipes call these;
 *   the long-press menu and the double-tap tweak use other paths). Both are wrapped through
 *   lib/handlers.ts and run the chosen action (lib/actions.ts).
 */

import { isOwn, runSwipeAction, targetOf } from '../lib/actions'
import { findModule } from '../lib/find'
import { originalHandler, wrapHandler } from '../lib/handlers'
import { setSwipeIcons, swipeIconsSupported } from '../lib/native'
import { onUpdate, settings } from '../lib/state'
import { reportError } from '../../../../shared/report'

const TAG = '[UITweaks]'
const ROW_UTILS = 'modules/messages/native/renderer/RowGeneratorUtils.tsx'
const ROW_CONSTANTS = 'modules/messages/native/renderer/RowGeneratorConstants.tsx'

function patchStages(): () => void {
	let swipeTypes: any
	const undoConstants = findModule(ROW_CONSTANTS, ['SwipeActionsType'], (mod: any) => {
		swipeTypes = mod?.SwipeActionsType ?? mod?.default?.SwipeActionsType
	})
	let restore: (() => void) | undefined
	const undoUtils = findModule(ROW_UTILS, ['createSwipeActions'], (mod: any) => {
		const host = typeof mod?.createSwipeActions === 'function' ? mod : mod?.default
		const original = host?.createSwipeActions
		if (typeof original !== 'function') {
			reportError(`${TAG} createSwipeActions isn't on this build; every message keeps Discord's swipe stages`)
			return
		}
		const replacement = function createSwipeActions(this: unknown, enabled: unknown, canEdit: unknown) {
			const result = original.call(this, enabled, canEdit)
			try {
				if (settings().swipeAllMessages && enabled && swipeTypes?.REPLY_EDIT != null && result === swipeTypes.REPLY) return swipeTypes.REPLY_EDIT
			} catch (error) {
				reportError(`${TAG} swipe stages failed:`, error)
			}
			return result
		}
		try {
			host.createSwipeActions = replacement
			if (host.createSwipeActions !== replacement) throw new Error('read-only export')
			restore = () => {
				if (host.createSwipeActions === replacement) host.createSwipeActions = original
			}
		} catch {
			// An ES export getter: define it over.
			const desc = Object.getOwnPropertyDescriptor(host, 'createSwipeActions')
			Object.defineProperty(host, 'createSwipeActions', { value: replacement, configurable: true, writable: true, enumerable: true })
			restore = () => {
				if (desc) Object.defineProperty(host, 'createSwipeActions', desc)
			}
		}
	})
	return () => {
		undoConstants()
		undoUtils()
		restore?.()
	}
}

/**
 * The stage icons. The native list draws them from Android vector drawables chosen by the row's
 * `SwipeActionsType` (proven live on 351.3: nothing JS puts on the row reaches them), so they are
 * swapped on the Kotlin side (src/main/kotlin/.../SwipeIcons.kt) at `Resources.getDrawable`. This
 * only tells native which action each stage shows, now and whenever the settings change. Rows
 * already built keep their icons until they're rebuilt (or Discord restarts).
 */
function syncIcons(): () => void {
	let alive = true
	// One drawable per stage for every row, so the icon follows the choice for others' messages
	// (most of a chat) when the two authors' choices differ.
	const push = () => {
		const { swipeShortOthers, swipeLongOthers } = settings()
		swipeIconsSupported().then(ok => {
			if (ok && alive) setSwipeIcons(swipeShortOthers, swipeLongOthers)
		})
	}
	push()
	const unsubscribe = onUpdate(push)
	return () => {
		alive = false
		unsubscribe()
		setSwipeIcons('stock', 'stock')
	}
}

/** The instance's original reply and edit (never our wrappers), for the actions. */
function originalsOf(instance: any) {
	return { reply: originalHandler(instance, 'handleInitiateReply'), edit: originalHandler(instance, 'handleInitiateEdit') }
}

export default function patchSwipe(): () => void {
	const undos: Array<() => void> = []
	undos.push(patchStages())
	undos.push(syncIcons())
	undos.push(
		wrapHandler('handleInitiateReply', (instance, original) =>
			function handleInitiateReply(this: unknown, event: any) {
				const s = settings()
				const target = targetOf(instance, event)
				const action = target.message == null || isOwn(target.message) ? s.swipeShortOwn : s.swipeShortOthers
				if (action === 'stock') return original.call(this, event)
				return runSwipeAction(action, 'short', { ...target, ...originalsOf(instance) }, s)
			},
		),
	)
	undos.push(
		wrapHandler('handleInitiateEdit', (instance, original) =>
			function handleInitiateEdit(this: unknown, event: any) {
				const s = settings()
				const target = targetOf(instance, event)
				const own = target.message == null || isOwn(target.message)
				const action = own ? s.swipeLongOwn : s.swipeLongOthers
				// Discord's own further swipe edits; on others' messages (there with "every message") it replies.
				if (action === 'stock' && own) return original.call(this, event)
				return runSwipeAction(action, 'long', { ...target, ...originalsOf(instance) }, s)
			},
		),
	)
	return () => {
		for (const undo of undos.splice(0)) {
			try {
				undo()
			} catch {
				/* already gone */
			}
		}
	}
}
