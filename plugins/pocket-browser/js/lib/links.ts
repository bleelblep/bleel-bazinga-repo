/**
 * Open links in Pocket Browser: web links tapped in Discord load in the Web tab.
 *
 * Discord opens links through two modules (348.5 bundle):
 *
 * - `lib/native/Linking.tsx` exports `openURL(url, ..., allowExternal = true)` and
 *   `openURLExternally(url, ...)`; both call the default export of
 * - `lib/openURL.tsx`, `default(url, ..., options)`, where `openURLExternally` passes
 *   `{ forceExternalBrowser: true }`.
 *
 * A link tapped in a chat message never reaches those, though (found on 350.2, where the first
 * version of this did nothing for chat links). The native chat fires `onTapLink`, and the chat view
 * hands it to
 *
 * - `modules/messages/native/handlers/handleMessagesTapLink.tsx`, `handleMessagesTapLink({ tapLinkData,
 *   ... })`. For a web link `tapLinkData.data` is `{ url, node: { title, target, content } }` with no
 *   `action` (TapLinkData.toMap in the 349.5 decompile); every other kind of link has an `action`.
 *
 * All three are wrapped, and callers read the export at call time, so swapping it takes effect at
 * once. Anything forced external, any non-web link, and Discord's own links (invites, message
 * links, gifts) go through untouched, as does every link while no chat box is on screen to open
 * the picker from. A masked link (`[text](url)`) is left to Discord, which first asks whether to
 * leave for the real address; saying yes then goes through `openURL`, wrapped above.
 */

import { getModuleByPath } from '../../../../shared/modules'
import { capturable, plainChatLink } from './format'
import { openWebTab } from './chatInput'
import { load } from './native'
import { settings } from './store'
import { reportError } from '../../../../shared/report'

const TAG = '[Pocket Browser]'

export { capturable, plainChatLink }

function openHere(url: unknown): boolean {
	const s = settings()
	if (!s.openLinks || !s.showTab || !capturable(url)) return false
	if (!openWebTab()) return false
	load(url, s.linksInNewTab)
	return true
}

function wrap(
	mod: any,
	key: string,
	skip: (args: any[]) => boolean,
	urlOf: (args: any[]) => unknown = args => args[0],
): () => void {
	const original = mod?.[key]
	if (typeof original !== 'function') throw new Error(`${key} is not a function`)
	const wrapper = function (this: unknown, ...args: any[]) {
		try {
			if (!skip(args) && openHere(urlOf(args))) return Promise.resolve(true)
		} catch (error) {
			reportError(`${TAG} opening a link here failed:`, error)
		}
		return Reflect.apply(original, this, args)
	}
	mod[key] = wrapper
	return () => {
		if (mod[key] === wrapper) mod[key] = original
	}
}

export function patchLinks(): () => void {
	const undo: Array<() => void> = []
	undo.push(
		getModuleByPath('lib/native/Linking.tsx', null, (mod: any) => {
			undo.push(wrap(mod, 'openURL', () => false))
		}, TAG),
	)
	undo.push(
		getModuleByPath('modules/messages/native/handlers/handleMessagesTapLink.tsx', null, (mod: any) => {
			undo.push(wrap(mod, 'handleMessagesTapLink', () => false, args => plainChatLink(args[0])))
		}, TAG),
	)
	undo.push(
		getModuleByPath('lib/openURL.tsx', null, (mod: any) => {
			undo.push(wrap(mod, 'default', args => args.some(arg => arg && typeof arg === 'object' && arg.forceExternalBrowser)))
		}, TAG),
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
