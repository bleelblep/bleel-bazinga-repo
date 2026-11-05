/**
 * Hides buttons in the "+" menu by the message box (Apps, Thread, Polls, Files, Photos).
 *
 * Traced in the 352.2 bundle (hermes-dec), not yet confirmed on a device. The "+" opens the media
 * keyboard; its button row is `modules/media_keyboard/native/components/MediaKeyboardBottomSheetActions.tsx`,
 * a memo whose `overflowButtons` prop is a list of `{ text, IconComponent, onPress, disabled }`
 * built in `MediaKeyboard.tsx` (and in `MediaKeyboardActionSheet` for Polls/Files/Photos). The items
 * have no key, so each is recognised by its icon: the export of its generated icon module, looked
 * up when the row renders (by then the keyboard has imported every one of them).
 *
 * A data edit on the props, like reactionBar.tsx: the buttons left keep Discord's own handlers.
 */

import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { wrapRender } from '../../../../shared/wrapRender'
import { findModule } from '../lib/find'
import { settings } from '../lib/state'
import { reportError } from '../../../../shared/report'
import type { MediaButton } from '../defaults'

const TAG = '[UITweaks]'
const ACTIONS = 'modules/media_keyboard/native/components/MediaKeyboardBottomSheetActions.tsx'
const ICONS = 'design/components/Icon/native/redesign/generated/'

/** Each button and the icon that marks it. */
export const MEDIA_BUTTONS: Array<{ id: MediaButton; label: string; icon: string }> = [
	{ id: 'apps', label: 'Apps', icon: 'AppsIcon' },
	{ id: 'thread', label: 'Thread', icon: 'ThreadIcon' },
	{ id: 'polls', label: 'Polls', icon: 'PollsIcon' },
	{ id: 'files', label: 'Files', icon: 'AttachmentIcon' },
	{ id: 'photos', label: 'Photos', icon: 'ImageIcon' },
]

/** Every export of the icon module that could be the component (named, or `default`). */
function iconComponents(name: string): unknown[] {
	try {
		const found = (discordFinders as any).lookupModuleWithImportedPath(`${ICONS}${name}.tsx`)
		const mod = Array.isArray(found) ? found[0] : found
		return [mod?.[name], mod?.default?.[name], mod?.default].filter(Boolean)
	} catch {
		return []
	}
}

function filterButtons(buttons: any[]): any[] {
	const hidden = settings().hiddenMediaButtons ?? {}
	const icons = new Set<unknown>()
	for (const button of MEDIA_BUTTONS) {
		if (hidden[button.id] === true) for (const icon of iconComponents(button.icon)) icons.add(icon)
	}
	if (!icons.size) return buttons
	return buttons.filter(button => !icons.has(button?.IconComponent))
}

export default (): (() => void) => {
	const undo: Array<() => void> = []
	undo.push(
		findModule(ACTIONS, null, (exports: any) => {
			const restore = wrapRender(exports, original => function (this: unknown, ...args: any[]) {
				try {
					const props = args[0]
					const buttons = props?.overflowButtons
					if (Array.isArray(buttons)) {
						const kept = filterButtons(buttons)
						if (kept.length !== buttons.length) {
							return Reflect.apply(original, this, [{ ...props, overflowButtons: kept }, ...args.slice(1)])
						}
					}
				} catch (error) {
					reportError(`${TAG} hiding "+" menu buttons failed:`, error)
				}
				return Reflect.apply(original, this, args)
			})
			if (restore) undo.push(restore)
			else reportError(`${TAG} the "+" menu has an unknown component shape`)
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
