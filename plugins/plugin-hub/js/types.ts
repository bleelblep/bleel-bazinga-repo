/**
 * One plugin pinned to the hub.
 *
 * A snapshot, not a reference. The name and icon are copied at the moment it is added, because
 * reading the live plugin list needs Valenced's Developer Mode (see `lib/installed.ts`), and the
 * hub has to keep working after that is switched back off. Opening an entry only needs its id:
 * Valenced registers every running plugin's settings page as a route named after the plugin.
 */
export interface Entry {
	id: string
	name: string
	icon?: string
	/** Depends on AI Core, or is AI Core. Listed on the AI Hub page. */
	ai: boolean
	/** Uses AI Core only when it is there: listed on the Hub as well (see `onPage`). Missing before 0.5.1. */
	aiOptional?: boolean
	/** The manifest's one-liner. Missing on entries added before 0.2.0; not shown at the moment. */
	description?: string
	/**
	 * Shown as a big tile at the top of its page (Hub or AI Hub). At most four per page are used, in
	 * the order they sit in `entries` -- which is what rearranging favourites changes.
	 */
	favourite?: boolean
	/**
	 * Also a row of its own in Discord's settings, in the Shortcuts section under Plugin Hub, so the
	 * plugin is one tap from Settings rather than two (see `ui/register.tsx`).
	 */
	inSettings?: boolean
}

export interface HubStorage {
	/**
	 * In display order. Stored as an array and always written whole: `jsonStorage.set()`
	 * replaces arrays rather than merging them, so removing an entry sticks (coding rule 6
	 * only bites keyed objects).
	 */
	entries: Entry[]
	/** The Cornhub easter egg (`lib/cornhub.ts`): long-press the settings button on a Hub page. */
	cornhub?: boolean
	/**
	 * Sections folded away on the Hub, AI Hub and Choose plugins pages, as `page:section` keys
	 * (`ui/components/Collapsible.tsx`). Written whole, like `entries`.
	 */
	collapsed?: string[]
	/**
	 * The AI Core section at the top of the AI Hub (`ui/components/AiInfo.tsx`). Missing means on.
	 * The two below only apply while it is on.
	 */
	aiInfo?: boolean
	/** Its Balance row: the money left on the key, for providers that report it. Missing means on. */
	aiInfoBalance?: boolean
	/** Its "Used most today" row. Missing means on. */
	aiInfoPlugins?: boolean
}
