import { setHidden } from "../../lib/hidden"
import { type MenuItem, openNativeActionSheet, stockMenuItems } from "../../lib/guildMenu"
import { refresh as refreshSortedGuilds } from "../../patches/sortedGuilds"
import { BAR_WIDTH, ICON_SIZE } from "../layout"
import { useGuildIndicator } from "../useGuildIndicator"
import Badge from "./Badge"
import ContextMenu from "./ContextMenu"
import GuildIcon from "./GuildIcon"
import MorphIcon from "./MorphIcon"
import Pill from "./Pill"
import { showToast as sharedToast } from "../../../../../shared/toast"
import { Stores } from "@valenced/discord/flux"
import { getModules } from "@valenced/modules/finders"
import { withProps } from "@valenced/modules/finders/filters"
import * as react from "@valenced/react"
import * as ReactNative from "react-native"

// valenced.utils.toast.show doesn't exist -- was a guess, confirmed wrong on-device
// ("Cannot read property 'show' of undefined" at preInit). Toasts go through shared/toast.ts,
// which picks the ToastActionCreators signature this Discord build has (it changed on 350.4).
function showToast(content: string) {
	sharedToast(content, "HideServersDrawerToast")
}

// Flux stores are looked up by name directly through the Stores proxy, not a module finder
// filter -- there is no `withStoreName` under modules.finders.filters.
// The *selected* guild id is assumed to live on a dedicated SelectedGuildStore, not
// GuildStore (GuildStore only holds guild data: getGuild/getGuilds), matching classic Revenge.
// Read per call, never at module scope -- see docs/coding-rules.md rule 1.
const stores = (): any => Stores

// getModules, not lookupModule: confirmed on-device (staff-tags plugin) that a lazily-loaded
// module can still be unregistered even from inside start() -- this file's top-level code
// runs at preInit (the whole plugin bundle executes together), before Discord's module
// registry is populated. lookupModule gives up immediately and permanently caches a false
// "not found"; getModules subscribes and calls back whenever the module actually loads.
let routing: any
getModules(withProps("transitionToGuild"), (mod: any) => {
	routing = mod
})

const SIZE = ICON_SIZE

/** Prefer SelectedGuildStore; fall back to GuildStore in case a build exposes it there. */
function readSelectedGuildId(): string | null {
	const { SelectedGuildStore, GuildStore } = stores()
	for (const store of [SelectedGuildStore, GuildStore]) {
		try {
			const value = store?.getGuildId?.()
			if (value != null) return String(value)
		} catch {
			/* try the next store */
		}
	}
	return null
}

/**
 * Deliberately reads the store fresh on every render rather than caching the id in state, so
 * a missed change event can at worst delay an update to the next render, never leave it
 * permanently wrong. SelectedChannelStore is in the subscription list because selecting a
 * guild always changes the selected channel too -- it's the one store most likely to emit on
 * every switch.
 */
export function useSelectedGuildId(): string | null {
	const { React } = react

	const [, bump] = React.useReducer((n: number) => n + 1, 0)

	React.useEffect(() => {
		const { SelectedGuildStore, GuildStore, SelectedChannelStore } = stores()
		const subscribed = [SelectedGuildStore, GuildStore, SelectedChannelStore].filter(s => s?.addChangeListener)
		if (!subscribed.length) return

		const onChange = () => bump()
		subscribed.forEach(s => s.addChangeListener(onChange))
		return () => subscribed.forEach(s => s.removeChangeListener?.(onChange))
	}, [])

	return readSelectedGuildId()
}

/**
 * Memoised: the bar re-renders on every ChannelStore/ReadStateStore emit (which fire
 * constantly while navigating in and out of DMs), and without this every guild row would
 * rebuild and reload its icon each time -- visible as a flash across the bar on DM<->server
 * switches. Rows still update themselves on their own state, since useGuildIndicator
 * subscribes internally.
 */
function GuildRow({ id, selected, onNavigated }: { id: string; selected: boolean; onNavigated?: () => void }) {
	const { React } = react
	const { Pressable, View } = ReactNative

	const [menuOpen, setMenuOpen] = React.useState(false)

	const guild = React.useMemo(() => {
		try {
			return stores().GuildStore?.getGuild?.(id)
		} catch {
			return undefined
		}
	}, [id])

	const navigate = React.useCallback(() => {
		// Deliberately no second argument: passing an explicit null selects *no* channel, so
		// the chat area renders empty for a frame before Discord resolves the guild's
		// remembered/default channel. Omitting it lets Discord pick the destination itself.
		try {
			routing?.transitionToGuild?.(id)
		} catch {
			/* ignore */
		}
		onNavigated?.()
	}, [id, onNavigated])

	// The stock long-press menu, plus one addition of our own.
	const items: MenuItem[] = React.useMemo(
		() => [
			...stockMenuItems(id),
			{
				label: "Hide server",
				danger: true,
				action: () => {
					setHidden(id, true)
					refreshSortedGuilds()
					showToast(`Hid ${guild?.name ?? "server"}`)
				},
			},
		],
		[id, guild?.name],
	)

	const openMenu = React.useCallback(() => {
		// Prefer Discord's own action sheet -- identical chrome, no reimplementation to keep
		// in sync. Only fall back to the custom modal if that call isn't available/throws.
		if (!openNativeActionSheet(guild?.name ?? "Server", items)) setMenuOpen(true)
	}, [guild?.name, items])

	// Same source as Badge's own corner badge, so the pill and badge never disagree (e.g. a
	// muted guild suppresses both, not just one).
	const { mentionCount: _mentionCount, showDot: _showDot } = useGuildIndicator(id)

	if (!guild) return null

	return (
		<>
			<Pressable onPress={navigate} onLongPress={openMenu} delayLongPress={450}>
				{/* Full bar-width row with the icon centred, so the left-edge pill can live at
				    left: 0 inside it rather than painting outside its parent -- see ui/layout.ts. */}
				<View style={{ width: BAR_WIDTH, height: SIZE, alignItems: "center", justifyContent: "center" }}>
					<Pill rowHeight={SIZE} selected={selected} />
					<View style={{ width: SIZE, height: SIZE }}>
						{/* radius 0 on the icon itself: MorphIcon clips it to the animated shape. */}
						<MorphIcon size={SIZE} selected={selected}>
							<GuildIcon guild={guild} size={SIZE} radius={0} />
						</MorphIcon>
						{/* Sibling, not a child -- MorphIcon clips its children, which would cut
						    the badge off at the icon's edge. */}
						<Badge guildId={id} />
					</View>
				</View>
			</Pressable>
			<ContextMenu visible={menuOpen} title={guild.name ?? "Server"} items={items} onClose={() => setMenuOpen(false)} />
		</>
	)
}

// React.memo can't run at module scope -- see the note in UnreadDmRow.tsx.
let Memoized: any

export default function GuildRowMemo(props: { id: string; selected: boolean; onNavigated?: () => void }) {
	const { React } = react
	Memoized ??= React.memo(GuildRow)
	return <Memoized {...props} />
}
