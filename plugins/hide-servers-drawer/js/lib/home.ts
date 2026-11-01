import { reportError } from "../../../../shared/report"
import { Stores } from "@valenced/discord/flux"
import * as finders from "@valenced/modules/finders"
import * as filters from "@valenced/modules/finders/filters"

export function selectedGuildId(): string | undefined {
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
export function goHome(): boolean {
	try {
		const { lookupModule } = finders
		const { withProps } = filters
		const routing = lookupModule<any>((withProps as any)("transitionToGuild"))?.[0]
		if (typeof routing?.transitionToGuild !== "function") return false
		routing.transitionToGuild("@me")
		return true
	} catch (error) {
		reportError("[HideServersDrawer] could not go to Home:", error)
		return false
	}
}
