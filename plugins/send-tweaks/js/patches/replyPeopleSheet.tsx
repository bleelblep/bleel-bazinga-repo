/**
 * A row at the bottom of the message long-press sheet that puts the author on, or takes them off,
 * the "Don't ping when replying" list. Only shown while that switch is on, and not on your own
 * messages.
 *
 * Same approach as Timezones' `patches/messageSheet.tsx`: hook
 * `ActionSheetActionCreators.openLazy`, patch the sheet module it resolves, and add a row group
 * inside the real ActionSheet with the shared `findMessageSheetGroupParent`.
 */

import { findMessageSheetGroupParent } from '../../../../shared/messageSheet'
import { reportError } from '../../../../shared/report'
import { isListed, menuLabel, toggleListed } from '../lib/replyPeople'
import { settings, TAG } from '../lib/state'
import * as assets from '@valenced/assets'
import * as actions from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'

function isMessageSheet(key: string) {
	return /message/i.test(key) && !/channel|forum|guild|thread/i.test(key)
}

let actionSheetRow: any
function ActionSheetRowComponent() {
	// Looked up when a sheet opens: lookupModule caches a miss for good, and the sheet UI may not be
	// loaded yet on a cold launch.
	actionSheetRow ??= finders.lookupModule<any>(filters.withProps('ActionSheetRow'))?.[0]?.ActionSheetRow
	return actionSheetRow
}

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
	if (!settings().noReplyMention) return null
	const ActionSheetRow = ActionSheetRowComponent()
	const author = message?.author
	const userId = author?.id != null ? String(author.id) : ''
	if (!ActionSheetRow || !userId || author?.bot) return null
	if (userId === (Stores as any).UserStore?.getCurrentUser?.()?.id) return null

	const name = author.globalName ?? author.username ?? 'them'
	const listed = isListed(userId)
	return (
		<ActionSheetRow.Group>
			<ActionSheetRow
				label={menuLabel(name, listed)}
				icon={<ActionSheetRow.Icon source={assets.getAssetIdByName('ArrowAngleLeftUpIcon')} />}
				onPress={() => {
					try {
						actions.ActionSheetActionCreators.hideActionSheet()
					} catch {
						/* most rows close the sheet themselves */
					}
					toggleListed(userId, name)
				}}
			/>
		</ActionSheetRow.Group>
	)
}

function inject(rendered: any, message: any) {
	const row = message && buildRow(message)
	if (!row) return
	const parent = findMessageSheetGroupParent(rendered, (Design as any).ActionSheet, ActionSheetRowComponent()?.Group)
	if (!parent) return
	const children = parent.props.children
	if (Array.isArray(children)) children.push(row)
	else parent.props.children = [children, row]
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
		after(mod, 'default', (rendered: any) => {
			try {
				if (rendered != null) inject(rendered, pendingMessage?.author ? pendingMessage : findMessage(rendered))
			} catch (error) {
				reportError(`${TAG} reply ping row failed:`, error)
			}
			pendingMessage = undefined
			return rendered
		}),
	)
	patchedModules.add(mod)
	return mod
}

export default function patchReplyPeopleSheet(): () => void {
	const patches: Array<() => void> = []
	patches.push(
		before(actions.ActionSheetActionCreators as any, 'openLazy', (args: any[]) => {
			try {
				const [sheet, key] = args
				if (typeof key === 'string' && isMessageSheet(key) && typeof sheet?.then === 'function') {
					// A derived promise: the sheet can't resolve until the row hook is in place.
					args[0] = sheet.then((mod: any) => patchSheetModule(mod, patches))
				}
			} catch (error) {
				reportError(`${TAG} openLazy hook failed:`, error)
			}
			return args
		}),
	)
	return () => {
		for (const unpatch of patches.reverse()) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
