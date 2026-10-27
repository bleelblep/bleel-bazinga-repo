/**
 * "Hide channel" (or "Hide category") in the channel long-press sheet.
 *
 * `openChannelLongPressActionSheet` opens the sheet through `ActionSheetActionCreators.openLazy`
 * with the key `ChannelLongPress-<channelId>` and props `{ channelId, onClose }` (350.2 bundle,
 * #53297). Same technique as Ghost Log NG's patches/localEditSheet.tsx: the lazy module promise is
 * wrapped so the sheet's `default` gets an after-hook, and our group goes in beside Discord's own
 * groups inside the sheet. A hidden channel can still be opened from search or a link, so its sheet
 * offers "Show channel" instead.
 *
 * On 351.3 the sheet's `default` only returns `<ChannelLongPressActionSheetConnected channel onClose />`
 * (seen on device 2026-10-18); the ActionSheet and its groups are rendered by that component. So when
 * the groups aren't in what we got, the wrapper component's type is swapped for one that renders the
 * original and looks again, a few levels deep at most.
 */

import { isChannelHidden, setChannelHidden } from "../lib/hidden"
import { findMessageSheetGroupParent } from "../../../../shared/messageSheet"
import { reportError } from "../../../../shared/report"
import { showToast } from "../../../../shared/toast"
import * as assets from "@valenced/assets"
import * as actions from "@valenced/discord/actions"
import { Design } from "@valenced/discord/design"
import { Stores } from "@valenced/discord/flux"
import * as finders from "@valenced/modules/finders"
import * as filters from "@valenced/modules/finders/filters"
import { after, before } from "@valenced/patcher"

const TAG = "[HideServersDrawer:channelSheet]"
const SYM_PATCHED = Symbol.for("bleelblep.hide-servers-drawer channel sheet")
const KEY = /^ChannelLongPress-/
const GUILD_CATEGORY = 4

let actionSheetRow: any
function ActionSheetRowComponent() {
	if (!actionSheetRow) {
		const { lookupModule } = finders
		const { withProps } = filters
		actionSheetRow = lookupModule<any>((withProps as any)("ActionSheetRow"))?.[0]?.ActionSheetRow
	}
	return actionSheetRow
}

function closeSheet() {
	try {
		actions.ActionSheetActionCreators.hideActionSheet()
	} catch {
		/* the row closes it */
	}
}

function buildGroup(channelId: string): any {
	const ActionSheetRow = ActionSheetRowComponent()
	if (!ActionSheetRow) return null
	const channel = (Stores as any).ChannelStore?.getChannel?.(channelId)
	// Server channels only: DMs and group DMs have no channel list to hide them from.
	if (!channel?.guild_id) return null

	const category = channel.type === GUILD_CATEGORY
	const what = category ? "category" : "channel"
	const hidden = isChannelHidden(channelId)
	const { getAssetIdByName } = assets

	return (
		<ActionSheetRow.Group key="hide-servers-drawer-channel">
			<ActionSheetRow
				label={hidden ? `Show ${what}` : `Hide ${what}`}
				subLabel={
					hidden
						? "Put it back in the channel list."
						: category
							? "Hides it and its channels from the list, only on this device."
							: "Hides it from the channel list, only on this device."
				}
				icon={<ActionSheetRow.Icon source={getAssetIdByName(hidden ? "EyeIcon" : "EyeSlashIcon")} />}
				onPress={() => {
					closeSheet()
					try {
						setChannelHidden(channelId, !hidden)
						showToast(
							hidden ? `${category ? "Category" : "Channel"} shown again.` : `Hidden. Show it again from Hide Servers' settings.`,
							"HideServersDrawerToast",
						)
					} catch (error) {
						reportError(`${TAG} toggle failed:`, error)
					}
				}}
			/>
		</ActionSheetRow.Group>
	)
}

function inject(rendered: any, channelId: string): boolean {
	const group = buildGroup(channelId)
	if (!group) return false
	const holder = findMessageSheetGroupParent(rendered, Design.ActionSheet, ActionSheetRowComponent()?.Group)
	const children = holder?.props?.children
	if (Array.isArray(children)) {
		children.push(group)
		return true
	}
	if (children) {
		holder.props.children = [children, group]
		return true
	}
	return false
}

const patchedModules = new WeakSet<any>()
let current: string | undefined
const MAX_DEPTH = 4

/** The function a component element renders with: plain, memo or forwardRef. */
function renderFunction(type: any): ((props: any, ref?: any) => any) | undefined {
	if (typeof type === "function" && !type.prototype?.isReactComponent) return type
	if (typeof type?.type === "function") return renderFunction(type.type)
	if (typeof type?.render === "function") return type.render
	return undefined
}

const wrappedTypes = new WeakMap<any, any>()

/** Puts our group into the sheet, looking inside wrapper components when it isn't at this level. */
function injectDeep(rendered: any, channelId: string, depth: number): any {
	if (rendered == null || typeof rendered !== "object" || rendered[SYM_PATCHED]) return rendered
	if (inject(rendered, channelId)) {
		rendered[SYM_PATCHED] = true
		return rendered
	}
	if (depth >= MAX_DEPTH || Array.isArray(rendered) || !rendered.type || rendered.type === Design.ActionSheet) return rendered
	const render = renderFunction(rendered.type)
	if (!render) return rendered
	let Wrapped = wrappedTypes.get(render)
	if (!Wrapped) {
		Wrapped = function HideChannelSheetLevel(props: any) {
			const inner = render(props)
			try {
				return current ? injectDeep(inner, current, depth + 1) : inner
			} catch (error) {
				reportError(`${TAG} adding the row failed:`, error)
				return inner
			}
		}
		wrappedTypes.set(render, Wrapped)
	}
	return { ...rendered, type: Wrapped }
}

function patchSheetModule(mod: any, patches: Array<() => void>) {
	if (!mod || typeof mod.default !== "function" || patchedModules.has(mod)) return mod
	try {
		patches.push(
			after(mod, "default", (rendered: any) => {
				try {
					return current ? injectDeep(rendered, current, 0) : rendered
				} catch (error) {
					reportError(`${TAG} adding the row failed:`, error)
					return rendered
				}
			}),
		)
		patchedModules.add(mod)
	} catch (error) {
		reportError(`${TAG} could not patch the sheet:`, error)
	}
	return mod
}

export default function patchChannelSheet(): () => void {
	const { ActionSheetActionCreators } = actions
	const patches: Array<() => void> = []

	patches.push(
		before(ActionSheetActionCreators as any, "openLazy", (args: any[]) => {
			try {
				const [sheet, key, props] = args
				if (typeof key === "string" && KEY.test(key) && typeof props?.channelId === "string" && typeof sheet?.then === "function") {
					current = props.channelId
					args[0] = sheet.then((mod: any) => patchSheetModule(mod, patches))
				}
			} catch (error) {
				reportError(`${TAG} openLazy hook failed:`, error)
			}
			return args // a before-hook must return the args array (coding rule 2)
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
