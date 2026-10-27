import { clearHidden, hiddenFolderIds, hiddenIds, isFolderHidden, isHidden, setFolderHidden, setHidden } from "../../lib/hidden"
import { refresh, store, unfiltered } from "../../patches/sortedGuilds"
import GuildIcon from "../components/GuildIcon"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import { Stores } from "@valenced/discord/flux"
import * as react from "@valenced/react"
import * as ReactNative from "react-native"

// Flux stores are looked up by name directly through the Stores proxy, not a module finder
// filter -- there is no `withStoreName` under modules.finders.filters. Read per call, never at
// module scope -- see docs/coding-rules.md rule 1.
const guildStore = (): any => (Stores as any).GuildStore

type Guild = { id: string; name: string; icon?: string }
type Group = { title: string; guilds: Guild[]; folderId?: string | number }

function guildById(id: string): Guild | undefined {
	try {
		const guild = guildStore()?.getGuild?.(id)
		if (guild) return { id: guild.id, name: guild.name ?? "Unnamed", icon: guild.icon }
	} catch {
		/* fall through */
	}
	return undefined
}

/**
 * Build the list in the same order the server bar shows it, folders included.
 *
 * Read through `unfiltered` so hidden servers still appear here -- otherwise hiding one
 * would remove it from this page and there would be no way to bring it back.
 */
function groups(): Group[] {
	const out: Group[] = []
	let loose: Guild[] = []

	const flush = () => {
		if (loose.length) {
			out.push({ title: "Servers", guilds: loose })
			loose = []
		}
	}

	let children: any[] | undefined
	try {
		children = unfiltered(() => store()?.getGuildsTree?.())?.root?.children
	} catch {
		/* fall back below */
	}

	if (Array.isArray(children)) {
		for (const node of children) {
			if (node?.type === "folder") {
				const guilds = (node.children ?? [])
					.map((child: any) => guildById(String(child?.id)))
					.filter(Boolean) as Guild[]

				if (!guilds.length) continue

				flush()
				out.push({ title: node.name || "Folder", guilds, folderId: node.id })
			} else if (node?.id != null) {
				const guild = guildById(String(node.id))
				if (guild) loose.push(guild)
			}
		}

		flush()
		if (out.length) return out
	}

	// Fallback: the tree was unavailable, so list everything alphabetically.
	let all: Record<string, any> = {}
	try {
		all = guildStore()?.getGuilds?.() ?? {}
	} catch {
		/* none */
	}

	const guilds = Object.values(all)
		.filter((g: any) => g?.id)
		.map((g: any) => ({ id: g.id, name: g.name ?? "Unnamed", icon: g.icon }))
		.sort((a: Guild, b: Guild) => a.name.localeCompare(b.name))

	return guilds.length ? [{ title: "Servers", guilds }] : []
}

/**
 * The per-server and per-folder toggle list, on its own route. This is the long part of the
 * plugin's settings; everything else is an index row away.
 *
 * Rendered as a plain navigator route, so there's no plugin `api` prop here -- the toggle
 * state all lives in lib/hidden's module-level Set, same as the bar patches read.
 */
export default function Servers() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { React } = react
	const { ScrollView } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } = Design

	// The switches are controlled by isHidden(), so the page has to re-render itself after a
	// toggle or the switch springs straight back to its old position.
	const [, bump] = React.useReducer((n: number) => n + 1, 0)

	const list = groups()
	const servers = hiddenIds().length
	const folders = hiddenFolderIds().length

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{servers + folders > 0 ? (
						<TableRowGroup title="Hidden" hasIcons>
							<TableRow
								label={`${servers} server${servers === 1 ? "" : "s"}, ${folders} folder${folders === 1 ? "" : "s"} hidden`}
								subLabel="Tap to show all again"
								icon={rowIcon("EyeSlashIcon")}
								onPress={() => {
									clearHidden()
									refresh()
									bump()
								}}
							/>
						</TableRowGroup>
					) : null}

					{list.length === 0 ? (
						<Text color="text-muted" variant="text-sm/normal">
							No servers found.
						</Text>
					) : (
						list.map((group, index) => (
							<TableRowGroup key={`${group.title}-${index}`} title={group.title}>
								{group.folderId != null ? (
									<TableSwitchRow
										label={`Hide entire "${group.title}" folder`}
										subLabel="Overrides the per-server switches below while it's hidden."
										value={isFolderHidden(group.folderId)}
										onValueChange={(v: boolean) => {
											setFolderHidden(group.folderId!, v)
											refresh()
											bump()
										}}
									/>
								) : null}
								{group.guilds.map(guild => (
									<TableSwitchRow
										key={guild.id}
										label={guild.name}
										icon={<GuildIcon guild={guild} />}
										value={isHidden(guild.id)}
										onValueChange={(v: boolean) => {
											setHidden(guild.id, v)
											refresh()
											bump()
										}}
									/>
								))}
							</TableRowGroup>
						))
					)}
				</Stack>
			</ScrollView>
		</Page>
	)
}
