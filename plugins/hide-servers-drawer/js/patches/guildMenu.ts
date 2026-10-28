/**
 * "Hide server" in the stock server bar's long-press menu.
 *
 * The menu's items come from `getGuildsBarGuildMenuItems(guildId)`, each
 * `{ IconComponent, label, action }`. A before-hook keeps the guild id and an after-hook appends
 * our item -- the same pair Mass Delete uses on this function. Found by path first: 349.5+
 * minifies function names, so the name filter is only the fallback (shared/modules.ts).
 *
 * Folders have no equivalent hook yet: the folder long-press menu hasn't been traced on device.
 */

import { setHidden } from "../lib/hidden"
import { refresh } from "./sortedGuilds"
import { getModuleByPath } from "../../../../shared/modules"
import { reportError } from "../../../../shared/report"
import { showToast } from "../../../../shared/toast"
import { Stores } from "@valenced/discord/flux"
import * as finders from "@valenced/modules/finders"
import * as filters from "@valenced/modules/finders/filters"
import { after, before } from "@valenced/patcher"
import { lookupGeneratedIconComponent } from "@valenced/utils/discord"

const TAG = "[HideServersDrawer:guildMenu]"
const PATH = "modules/guilds_bar/native/utils/getGuildsBarGuildMenuItems.tsx"
const NAME = "getGuildsBarGuildMenuItems"
const KEY = "hide-servers-drawer-hide"
/** Let the menu finish closing before the bar changes and the toast shows. */
const ACTION_DELAY = 300

function selectedGuildId(): string | undefined {
	try {
		const id = (Stores as any).SelectedGuildStore?.getGuildId?.()
		return typeof id === "string" ? id : undefined
	} catch {
		return undefined
	}
}

/**
 * Leaves a server for Home (the DM list) before it is hidden, so the bar never has a selected
 * server it no longer lists. "@me" is Discord's Home id. Returns false if routing wasn't found.
 */
function goHome(): boolean {
	try {
		const { lookupModule } = finders
		const { withProps } = filters
		const routing = lookupModule<any>((withProps as any)("transitionToGuild"))?.[0]
		if (typeof routing?.transitionToGuild !== "function") return false
		routing.transitionToGuild("@me")
		return true
	} catch (error) {
		reportError(`${TAG} could not go to Home:`, error)
		return false
	}
}

function guildName(guildId: string): string {
	try {
		const name = (Stores as any).GuildStore?.getGuild?.(guildId)?.name
		return typeof name === "string" && name ? name : "server"
	} catch {
		return "server"
	}
}

/**
 * Valenced's Reload Required prompt: Discord's stock server bar doesn't always drop a server it has
 * already drawn until the app reloads, so hiding one from this menu asks for the reload.
 */
let requireReload: (() => void) | undefined

function hideServer(guildId: string) {
	setTimeout(() => {
		try {
			if (selectedGuildId() === guildId) goHome()
			setHidden(guildId, true)
			refresh()
			showToast(`Hid ${guildName(guildId)}. Show it again from Hide Servers' settings.`, "HideServersDrawerToast")
			try {
				requireReload?.()
			} catch (error) {
				reportError(`${TAG} requireReload failed:`, error)
			}
		} catch (error) {
			reportError(`${TAG} hiding the server failed:`, error)
		}
	}, ACTION_DELAY)
}

export default function patchGuildMenu(onHidden?: () => void): () => void {
	requireReload = onHidden
	const patches: Array<() => void> = []
	let guildId: string | undefined

	const stop = getModuleByPath(
		PATH,
		(filters.withName as any)(NAME),
		(mod: any) => {
			const key = typeof mod?.[NAME] === "function" ? NAME : typeof mod?.default === "function" ? "default" : undefined
			if (!key) {
				reportError(`${TAG} the server menu module has no function to hook`)
				return
			}
			patches.push(
				before(mod, key, (args: any[]) => {
					try {
						guildId = typeof args[0] === "string" ? args[0] : (args[0]?.guildId ?? args[0]?.id)
					} catch {
						guildId = undefined
					}
					return args // a before-hook must return the args array (coding rule 2)
				}),
			)
			patches.push(
				after(mod, key, (items: any) => {
					try {
						const id = guildId
						guildId = undefined
						if (typeof id !== "string" || !Array.isArray(items) || items.some(item => item?.key === KEY)) return items
						let IconComponent: any
						try {
							IconComponent = lookupGeneratedIconComponent("EyeSlashIcon")
						} catch {
							/* the item still works without an icon */
						}
						return [
							...items,
							{
								key: KEY,
								IconComponent,
								label: "Hide server",
								action: () => hideServer(id),
							},
						]
					} catch (error) {
						reportError(`${TAG} adding the menu item failed:`, error)
						return items
					}
				}),
			)
		},
		TAG,
	)

	return () => {
		requireReload = undefined
		stop()
		for (const unpatch of patches.splice(0)) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
