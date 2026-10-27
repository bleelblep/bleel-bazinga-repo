// getGuildsBarGuildMenuItems is a named function, findable directly via withName -- takes a
// guildId, returns the real stock long-press menu, each item shaped { IconComponent, label, action }.
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'

let menuItemsFn: ((guildId: string) => any[]) | undefined

function resolveMenuItemsFn() {
	if (menuItemsFn !== undefined) return menuItemsFn
	try {
		const { lookupModule } = finders
		const { withName } = filters
		menuItemsFn = lookupModule<any>(withName("getGuildsBarGuildMenuItems"))?.[0]
	} catch {
		menuItemsFn = undefined
	}
	return menuItemsFn
}

// Also deferred to first use, not resolved at module top level: this file's top-level code
// runs at preInit (the whole plugin bundle executes together), before Discord's module
// registry is populated -- lookupModule gives up immediately and permanently caches a false
// "not found" for anything not already loaded that early. Confirmed on-device elsewhere
// (staff-tags' getTagProperties).
let actionSheetFn: ((opts: Record<string, unknown>) => void) | undefined

function resolveActionSheetFn() {
	if (actionSheetFn !== undefined) return actionSheetFn
	try {
		const { lookupModule } = finders
		const { withProps } = filters
		actionSheetFn = lookupModule<any>(withProps("showSimpleActionSheet"))?.[0]?.showSimpleActionSheet
	} catch {
		actionSheetFn = undefined
	}
	return actionSheetFn
}

export interface MenuItem {
	label: string
	danger?: boolean
	action: () => void
}

/** Real per-guild stock menu items. Empty array if the lookup fails on this build. */
export function stockMenuItems(guildId: string): MenuItem[] {
	const fn = resolveMenuItemsFn()
	if (!fn) return []

	try {
		const raw = fn(guildId) ?? []
		if (!Array.isArray(raw)) return []

		return raw
			.filter((item: any) => item && typeof item.action === "function" && item.label)
			.map((item: any) => ({
				label: String(item.label),
				// Real stock items never carry this, but third-party plugins that also append
				// to this same shared array (e.g. purge-my-messages) might mark their own item
				// destructive -- preserve it instead of silently dropping it.
				danger: !!(item.danger || item.variant === "destructive" || item.isDestructive),
				action: () => item.action(),
			}))
	} catch {
		return []
	}
}

/**
 * Try Discord's own action sheet for pixel-identical chrome. Returns true only if the call
 * completed without throwing; there is no signal available here for "opened but rendered
 * wrong", so a bad guess at the payload shape needs to be caught by eye.
 */
export function openNativeActionSheet(title: string, items: MenuItem[]): boolean {
	const showSimpleActionSheet = resolveActionSheetFn()
	if (typeof showSimpleActionSheet !== "function" || !items.length) return false

	try {
		showSimpleActionSheet({
			key: "HideServersDrawerGuildMenu",
			header: { title },
			options: items.map(item => ({
				label: item.label,
				isDestructive: !!item.danger,
				onPress: item.action,
			})),
		})
		return true
	} catch {
		return false
	}
}
