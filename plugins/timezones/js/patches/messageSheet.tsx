/**
 * "Their time" in the message long-press sheet: shows the author's local time now and opens the
 * timezone picker. The timestamp in chat is native row data and takes no presses, so the sheet is
 * the way in, as in Pronouns (`plugins/pronouns/js/patches/messageSheet.tsx`, whose approach this
 * copies: hook `ActionSheetActionCreators.openLazy`, patch the sheet module it resolves, add a row
 * group inside the real ActionSheet with the shared `findMessageSheetGroupParent`).
 */

import { findMessageSheetGroupParent } from '../../../../shared/messageSheet'
import { pickZone } from '../lib/picker'
import { zoneFor } from '../lib/resolve'
import { settings } from '../lib/state'
import { timeIn, zoneName } from '../lib/zones'
import * as assets from '@valenced/assets'
import * as actions from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import { reportError } from '../../../../shared/report'

const TAG = '[Timezones]'

function isMessageSheet(key: string) {
	return /message/i.test(key) && !/channel|forum|guild|thread/i.test(key)
}

let actionSheetRow: any
function ActionSheetRowComponent() {
	if (!actionSheetRow) {
		// Looked up when a sheet opens: lookupModule caches a miss for good, and this sheet UI may
		// not be loaded yet on a cold launch.
		const { lookupModule } = finders
		const { withProps } = filters
		actionSheetRow = lookupModule<any>(withProps('ActionSheetRow'))?.[0]?.ActionSheetRow
	}
	return actionSheetRow
}

/** The message the sheet is about, from the stashed props or a walk of the rendered tree. */
function findMessage(rendered: any): any {
	const seen = new Set<any>()
	let found: any
	const visit = (node: any, depth: number) => {
		if (found || !node || depth > 30 || seen.has(node)) return
		seen.add(node)
		if (node.props?.message?.author) {
			found = node.props.message
			return
		}
		if (Array.isArray(node)) for (const child of node) visit(child, depth + 1)
		else visit(node.props?.children, depth + 1)
	}
	visit(rendered, 0)
	return found
}

function buildRow(message: any) {
	const ActionSheetRow = ActionSheetRowComponent()
	if (!ActionSheetRow) return null
	const authorId = message?.author?.id != null ? String(message.author.id) : ''
	if (!authorId) return null
	try {
		if (authorId === (Stores as any).UserStore?.getCurrentUser?.()?.id) return null
	} catch {
		/* store not ready: show the row anyway */
	}

	const name = message.author?.globalName ?? message.author?.username ?? 'this person'
	const found = zoneFor(authorId)
	const time = found && timeIn(found.zone, Date.now(), settings().hour24)
	const label = time ? `Their time: ${time.time}${time.otherDay ? ` ${time.otherDay}` : ''}` : 'Set their timezone…'
	const subLabel = found
		? `${found.place ?? zoneName(found.zone)} · ${found.source === 'you' ? 'set by you, tap to change' : found.source === 'equicord' ? "from Equicord's list, tap to set your own" : 'from the shared list, tap to set your own'}`
		: 'Show their local time next to their messages'

	const { getAssetIdByName } = assets
	const onPress = () => {
		try {
			actions.ActionSheetActionCreators.hideActionSheet()
		} catch {
			/* most rows close the sheet themselves */
		}
		pickZone(authorId, name)
	}

	return (
		<ActionSheetRow.Group>
			<ActionSheetRow
				label={label}
				subLabel={subLabel}
				icon={<ActionSheetRow.Icon source={getAssetIdByName('ClockIcon')} />}
				onPress={onPress}
			/>
		</ActionSheetRow.Group>
	)
}

function inject(rendered: any, message: any): boolean {
	if (!message) return false
	const row = buildRow(message)
	if (!row) return false
	const { ActionSheet } = Design as any
	const parent = findMessageSheetGroupParent(rendered, ActionSheet, ActionSheetRowComponent()?.Group)
	if (!parent) return false
	const children = parent.props.children
	if (Array.isArray(children)) children.unshift(row)
	else parent.props.children = [row, children]
	return true
}

const patchedModules = new WeakSet<any>()

function patchSheetModule(mod: any, patches: Array<() => void>): any {
	if (!mod || typeof mod.default !== 'function' || patchedModules.has(mod)) return mod
	let pendingMessage: any
	patches.push(
		before(mod, 'default', (args: any[]) => {
			pendingMessage = args?.[0]?.message
			return args
		}),
	)
	patches.push(
		after(mod, 'default', (rendered: any) => {
			try {
				if (rendered != null) inject(rendered, pendingMessage?.author ? pendingMessage : findMessage(rendered))
			} catch (error) {
				reportError(`${TAG} sheet injection failed:`, error)
			}
			pendingMessage = undefined
			return rendered
		}),
	)
	patchedModules.add(mod)
	return mod
}

export default function patchMessageSheet(): () => void {
	const { ActionSheetActionCreators } = actions
	const patches: Array<() => void> = []

	patches.push(
		before(ActionSheetActionCreators as any, 'openLazy', (args: any[]) => {
			try {
				const [sheet, key] = args
				if (typeof key === 'string' && isMessageSheet(key) && sheet && typeof sheet.then === 'function') {
					// A derived promise: the sheet can't resolve until the row hook is in place.
					args[0] = sheet.then((mod: any) => patchSheetModule(mod, patches))
				}
			} catch (error) {
				reportError(`${TAG} openLazy hook failed:`, error)
			}
			// Outside the try: a before-hook must always return the args array.
			return args
		}),
	)

	return () => {
		for (const unpatch of patches) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
