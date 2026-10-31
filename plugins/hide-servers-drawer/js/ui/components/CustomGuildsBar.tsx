import { subscribeDmChanges, unreadDmChannels } from "../../lib/dms"
import { isFolderHidden, isHidden, onBarChange } from "../../lib/hidden"
import { goHome } from "../../patches/guildMenu"
import { store as sortedGuildStore } from "../../patches/sortedGuilds"
import { BAR_WIDTH } from "../layout"
import { barBackground, separator } from "../theme"
import DmIcon from "./DmIcon"
import DoneButton from "./DoneButton"
import FolderRow from "./FolderRow"
import GuildRow, { useSelectedGuildId } from "./GuildRow"
import UnreadDmRow from "./UnreadDmRow"
import { Stores } from "@valenced/discord/flux"
import { getModules } from "@valenced/modules/finders"
import { withProps } from "@valenced/modules/finders/filters"
import * as react from "@valenced/react"
import * as ReactNative from "react-native"


// getModules, not lookupModule: confirmed on-device (staff-tags plugin) that a lazily-loaded
// module can still be unregistered even from inside start() -- this file's top-level code
// runs at preInit (the whole plugin bundle executes together), before Discord's module
// registry is populated. lookupModule gives up immediately and permanently caches a false
// "not found"; getModules subscribes and calls back whenever the module actually loads.
let channelActions: any
let routes: any
let safeArea: any
getModules(withProps("selectPrivateChannel"), (mod: any) => {
	channelActions = mod
})
getModules(withProps("ME"), (mod: any) => {
	routes = mod
})
getModules(withProps("useSafeAreaInsets"), (mod: any) => {
	safeArea = mod
})

// Flux stores are looked up by name directly through the Stores proxy, not a module finder
// filter -- there is no `withStoreName` under modules.finders.filters. Read per call, never at
// module scope -- see docs/coding-rules.md rule 1.
const selectedChannelStore = (): any => (Stores as any).SelectedChannelStore

// Discord's own bottom tab bar ("You"/home/etc) is a separate fixed-height UI element, not
// part of the safe-area inset -- the inset only covers the gesture-nav pill below it. This
// bar renders as an overlay on top of that whole screen, so without reserving space for
// both, the last rows end up drawn underneath the tab bar instead of stopping above it.
const TAB_BAR_HEIGHT = 140

// Replacing the real guild bar wholesale drops its own safe-area-aware scaffolding, so the
// DM button renders flush against the status bar instead of below it. Android needs
// StatusBar.currentHeight added explicitly; iOS's real inset is handled by useBottomSafeInset.
function topInset(): number {
	const { StatusBar, Platform } = ReactNative
	if (Platform.OS === "android") return StatusBar?.currentHeight ?? 24
	return 0
}

/** react-native-safe-area-context's hook, if this build bundles it; 0 if not. */
function useBottomSafeInset(): number {
	try {
		if (typeof safeArea?.useSafeAreaInsets === "function") {
			const insets = safeArea.useSafeAreaInsets()
			if (typeof insets?.bottom === "number") return insets.bottom
		}
	} catch {
		/* ignore */
	}
	return 0
}

function useSelectedChannelId(): string | null {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { React } = react
	const SelectedChannelStore = selectedChannelStore()

	const [id, setId] = React.useState<string | null>(() => {
		try {
			return SelectedChannelStore?.getChannelId?.() ?? null
		} catch {
			return null
		}
	})

	React.useEffect(() => {
		if (!SelectedChannelStore?.addChangeListener) return
		const onChange = () => {
			try {
				setId(SelectedChannelStore.getChannelId?.() ?? null)
			} catch {
				/* ignore */
			}
		}
		SelectedChannelStore.addChangeListener(onChange)
		return () => SelectedChannelStore.removeChangeListener?.(onChange)
	}, [])

	return id
}

/**
 * Open the DM list, the way stock's Home button does. Passing null clears the
 * private-channel selection, which is what lands on the DM list rather than any one
 * conversation (the currently-selected channel, if handed to selectPrivateChannel directly,
 * would be a guild channel whenever the user is sitting in a server).
 */
function openDms() {
	try {
		channelActions?.selectPrivateChannel?.(null)
	} catch {
		/* ignore */
	}
}

/**
 * Non-virtualized stand-in for Discord's GuildsBar. It maps `getGuildsTree().root.children`
 * straight into plain rows -- SortedGuildStore.getGuildsTree is already patched (see
 * ../../patches/sortedGuilds) to drop hidden guilds, so there is nothing here for a hidden
 * id to leave a slot in. That absence is the fix: a virtualized list reserves geometry for
 * every item in its data array including ones that render null, a plain array map does not.
 */
export default function CustomGuildsBar({ editing = false }: { editing?: boolean }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { React } = react
	const { ScrollView, View } = ReactNative

	const [, bump] = React.useReducer((n: number) => n + 1, 0)

	React.useEffect(() => {
		const store = sortedGuildStore()
		if (!store?.addChangeListener) return
		const onChange = () => bump()
		store.addChangeListener(onChange)
		return () => store.removeChangeListener?.(onChange)
	}, [])

	const [, bumpDms] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => subscribeDmChanges(bumpDms), [])

	// Edit mode redraws on every tap that hides or shows a server.
	const [, bumpHidden] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => onBarChange(bumpHidden), [])

	const selectedId = useSelectedGuildId()
	const selectedChannelId = useSelectedChannelId()
	const inDms = selectedId == null || selectedId === (routes?.ME ?? "/channels/@me")
	const bottomPadding = TAB_BAR_HEIGHT + useBottomSafeInset()

	let children: any[] = []
	try {
		children = sortedGuildStore()?.getGuildsTree?.()?.root?.children ?? []
	} catch {
		/* ignore */
	}

	const unread = editing ? [] : unreadDmChannels()

	// Leaving edit mode while sitting in a server that's now hidden: go Home first, so the bar
	// never has a selected server it no longer lists.
	const finish = () => {
		if (selectedId != null && isHidden(selectedId)) goHome()
	}

	return (
		<View style={{ width: BAR_WIDTH, backgroundColor: barBackground(), paddingTop: topInset() }}>
			{editing ? <DoneButton onDone={finish} /> : <DmIcon selected={inDms} onPress={openDms} />}

			{/* Rows are each a full BAR_WIDTH with their icon centred, so nothing needs to paint
			    outside its own bounds and no overflow handling is required here. */}
			<ScrollView contentContainerStyle={{ alignItems: "center", paddingBottom: bottomPadding }} showsVerticalScrollIndicator={false}>
				{unread.map(dm => (
					<View key={dm.channelId} style={{ marginBottom: 10 }}>
						<UnreadDmRow dm={dm} selected={dm.channelId === selectedChannelId} />
					</View>
				))}

				<View style={{ height: 2, width: 32, marginBottom: 10, backgroundColor: separator(), borderRadius: 1 }} />

				{children.map((node: any, index: number) => {
					if (!node) return null
					// Never Math.random() here -- a fresh key each render makes React tear the
					// row down and rebuild it (reloading its image) on every re-render.
					const key = node.id ?? `node-${index}`
					return (
						<View key={key} style={{ marginBottom: 10 }}>
							{node.type === "folder" ? (
								<FolderRow node={node} editing={editing} hidden={editing && isFolderHidden(node.id)} />
							) : node.id != null ? (
								<GuildRow
									id={String(node.id)}
									selected={String(node.id) === selectedId}
									editing={editing}
									hidden={editing && isHidden(String(node.id))}
								/>
							) : null}
						</View>
					)
				})}
			</ScrollView>
		</View>
	)
}
