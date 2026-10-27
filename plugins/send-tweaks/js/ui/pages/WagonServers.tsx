import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { confirmDestructive } from '../../../../../shared/ui/confirm'
import { greetingsUnlocked } from '../../lib/greetings'
import { useSettings } from '../../lib/state'
import {
	addServer,
	currentGuildId,
	deletePlaceholder,
	joinedServers,
	keyProblem,
	normalizeKey,
	removeServer,
	savePlaceholder,
	serverName,
	updateServer,
} from '../../lib/wagon'
import { FieldRow } from '../fieldGroup'
import { dangerIcon, rowIcon } from '../icon'
import {
	WAGON_ADD_SERVER_ROUTE,
	WAGON_PLACEHOLDER_ROUTE,
	WAGON_SERVER_ROUTE,
} from '../routes'
import { useBottomPadding } from '../safeArea'
import type { ReactNode } from 'react'
import type { WagonServer } from '../../lib/wagon'
import type { Navigation } from '../navigation'

/** Which server / placeholder the sub-page opened for. Set just before navigating. */
let selectedGuildId: string | undefined
let selectedKey: string | undefined

interface PickRequest {
	/** Servers not to offer (already added). */
	exclude: string[]
	onPick(guild: { id: string; name: string }): void
}

let pickRequest: PickRequest | undefined

/** Opens the server picker for someone else (a rule's server list) instead of the Servers page. */
export function openServerPicker(navigation: Navigation, request: PickRequest) {
	pickRequest = request
	navigation.navigate(WAGON_ADD_SERVER_ROUTE)
}

function WagonPage({
	children,
	open,
}: {
	children?: ReactNode
	open?: boolean
}) {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack } = Design
	const paddingBottom = useBottomPadding()
	return (
		<Page>
			{open || greetingsUnlocked() ? (
				<ScrollView
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={{ paddingBottom }}
				>
					<Stack spacing={24}>{children}</Stack>
				</ScrollView>
			) : null}
		</Page>
	)
}

function nav(): Navigation {
	return ReactNavigationNative.useNavigation() as Navigation
}

function serverLine(server: WagonServer, placeholders: number): string {
	if (server.off) return 'Welcome Wagon off here'
	const own = Object.values(server.values ?? {}).filter(value =>
		value.trim(),
	).length
	return placeholders
		? `${own} of ${placeholders} placeholder${placeholders === 1 ? '' : 's'} set for this server`
		: 'On'
}

/** The Servers page: your placeholders, then the servers you've set up. */
export default function WagonServers() {
	const { TableRowGroup, TableRow, Text } = Design
	const navigation = nav()
	const s = useSettings()
	const placeholders = s.wagonPlaceholders ?? []
	const servers = s.wagonServers ?? []

	return (
		<WagonPage>
			<Text variant="text-sm/normal" color="text-muted">
				Give a placeholder a different value in each server, like {'{rules}'}{' '}
				pointing at the right rules channel, and turn Welcome Wagon off where
				you don't want it. Servers you haven't added use the defaults.
			</Text>

			<TableRowGroup title="Your placeholders" hasIcons>
				{placeholders.map(entry => (
					<TableRow
						key={entry.key}
						label={`{${entry.key}}`}
						subLabel={
							entry.value
								? `Default: ${entry.value}`
								: 'No default: blank where a server has none'
						}
						icon={rowIcon('TagIcon', 'PencilIcon')}
						arrow
						onPress={() => {
							selectedKey = entry.key
							navigation.navigate(WAGON_PLACEHOLDER_ROUTE)
						}}
					/>
				))}
				<TableRow
					label="Add a placeholder"
					subLabel="A name like rules or staff, used as {rules} in Replace with"
					icon={rowIcon('PlusSmallIcon', 'PlusMediumIcon')}
					arrow
					onPress={() => {
						selectedKey = undefined
						navigation.navigate(WAGON_PLACEHOLDER_ROUTE)
					}}
				/>
			</TableRowGroup>

			<TableRowGroup title="Servers" hasIcons>
				{servers.map(server => (
					<TableRow
						key={server.guildId}
						label={serverName(server)}
						subLabel={serverLine(server, placeholders.length)}
						icon={rowIcon(
							server.off ? 'CircleXIcon' : 'CircleCheckIcon',
							'ServerIcon',
						)}
						arrow
						onPress={() => {
							selectedGuildId = server.guildId
							navigation.navigate(WAGON_SERVER_ROUTE)
						}}
					/>
				))}
				<TableRow
					label="Add a server"
					subLabel="Choose from the servers you're in"
					icon={rowIcon('PlusSmallIcon', 'PlusMediumIcon')}
					arrow
					onPress={() => navigation.navigate(WAGON_ADD_SERVER_ROUTE)}
				/>
			</TableRowGroup>
		</WagonPage>
	)
}

/** One server: on/off and its own placeholder values. */
export function WagonServerPage() {
	const { TableRowGroup, TableRow, TableSwitchRow, Text, TextInput } = Design
	const navigation = nav()
	const s = useSettings()
	const server = (s.wagonServers ?? []).find(
		item => item.guildId === selectedGuildId,
	)
	const placeholders = s.wagonPlaceholders ?? []
	if (!server) {
		return (
			<WagonPage>
				<Text variant="text-sm/normal" color="text-muted">
					This server was removed.
				</Text>
			</WagonPage>
		)
	}

	const setValue = (key: string, value: string) =>
		updateServer(server.guildId, current => ({
			...current,
			values: { ...(current.values ?? {}), [key]: value },
		}))

	return (
		<WagonPage>
			<TableRowGroup>
				<TableSwitchRow
					label="Welcome Wagon in this server"
					subLabel={
						server.off
							? 'Off: rules that use placeholders, snippets or random choices are skipped here; plain rules still run'
							: 'On: your rules fill in placeholders here'
					}
					value={!server.off}
					onValueChange={(on: boolean) =>
						updateServer(server.guildId, current => ({ ...current, off: !on }))
					}
				/>
			</TableRowGroup>

			{server.off ? null : placeholders.length ? (
				<TableRowGroup title="Placeholders in this server">
					{placeholders.map(entry => (
						<FieldRow
							key={entry.key}
							label={`{${entry.key}}`}
							description={
								entry.value
									? `Leave blank to use the default: ${entry.value}`
									: 'Leave blank for nothing'
							}
						>
							<TextInput
								value={server.values?.[entry.key] ?? ''}
								placeholder={entry.value || undefined}
								onChange={(text: string) => setValue(entry.key, text)}
							/>
						</FieldRow>
					))}
				</TableRowGroup>
			) : (
				<Text variant="text-sm/normal" color="text-muted">
					Add a placeholder on the Servers page to give it a value here.
				</Text>
			)}

			<TableRowGroup hasIcons>
				<TableRow
					variant="danger"
					label="Remove this server"
					subLabel="It goes back to the defaults, with Welcome Wagon on"
					icon={dangerIcon('TrashIcon')}
					onPress={() =>
						confirmDestructive({
							title: `Remove ${serverName(server)}?`,
							body: "Its placeholder values are deleted and it uses the defaults again. Your rules aren't changed.",
							action: 'Remove',
							onConfirm: () => {
								removeServer(server.guildId)
								navigation.goBack()
							},
						})
					}
				/>
			</TableRowGroup>
		</WagonPage>
	)
}

/** Pick a server you're in. The one open right now comes first. */
export function WagonAddServer() {
	const { React } = react
	const { TableRowGroup, TableRow, Text, TextInput } = Design
	const navigation = nav()
	const s = useSettings()
	const [query, setQuery] = React.useState('')
	// Taken once: a request belongs to the visit that made it.
	const [request] = React.useState(() => {
		const taken = pickRequest
		pickRequest = undefined
		return taken
	})
	const added = new Set(
		request
			? request.exclude
			: (s.wagonServers ?? []).map(server => server.guildId),
	)
	const all = joinedServers().filter(guild => !added.has(guild.id))
	const here = currentGuildId()
	const current = all.find(guild => guild.id === here)
	const q = query.trim().toLowerCase()
	const shown = all.filter(
		guild => guild.id !== here && (!q || guild.name.toLowerCase().includes(q)),
	)

	const pick = (guild: { id: string; name: string }) => {
		if (request) {
			request.onPick(guild)
			navigation.goBack()
			return
		}
		addServer(guild.id, guild.name)
		selectedGuildId = guild.id
		navigation.goBack()
		navigation.navigate(WAGON_SERVER_ROUTE)
	}

	return (
		<WagonPage open={!!request}>
			<TableRowGroup>
				<FieldRow label="Search">
					<TextInput
						value={query}
						placeholder="Server name"
						onChange={setQuery}
					/>
				</FieldRow>
			</TableRowGroup>
			{current && (!q || current.name.toLowerCase().includes(q)) ? (
				<TableRowGroup title="Open now">
					<TableRow label={current.name} arrow onPress={() => pick(current)} />
				</TableRowGroup>
			) : null}
			{shown.length ? (
				<TableRowGroup title="Your servers">
					{shown.map(guild => (
						<TableRow
							key={guild.id}
							label={guild.name}
							arrow
							onPress={() => pick(guild)}
						/>
					))}
				</TableRowGroup>
			) : (
				<Text variant="text-sm/normal" color="text-muted">
					{all.length
						? 'No server matches.'
						: "You've added every server you're in."}
				</Text>
			)}
		</WagonPage>
	)
}

/** Add or edit one of your placeholders. */
export function WagonPlaceholderPage() {
	const { React } = react
	const { TableRowGroup, TableRow, Text, TextInput } = Design
	const navigation = nav()
	const s = useSettings()
	const [editing] = React.useState(selectedKey)
	const existing = (s.wagonPlaceholders ?? []).find(
		entry => entry.key === editing,
	)
	const [name, setName] = React.useState(existing?.key ?? '')
	const [value, setValue] = React.useState(existing?.value ?? '')
	const key = normalizeKey(name)
	const problem = name ? keyProblem(key, editing) : undefined
	const usedIn = (s.wagonServers ?? []).filter(server =>
		server.values?.[editing ?? '']?.trim(),
	).length

	const save = () => {
		if (keyProblem(key, editing)) return
		savePlaceholder({ key, value }, editing)
		navigation.goBack()
	}

	return (
		<WagonPage>
			<TableRowGroup>
				<FieldRow
					label="Name"
					description={
						problem ??
						(key
							? `Use it as {${key}} in Replace with.`
							: 'Letters, numbers and _, like rules or staff.')
					}
				>
					<TextInput value={name} placeholder="rules" onChange={setName} />
				</FieldRow>
				<FieldRow
					label="Default"
					description="Used in servers with no value of their own, and in DMs. Can be blank."
				>
					<TextInput value={value} placeholder="#rules" onChange={setValue} />
				</FieldRow>
			</TableRowGroup>

			<TableRowGroup hasIcons>
				<TableRow
					label={editing ? 'Save' : 'Add placeholder'}
					subLabel={
						editing && key !== editing && key
							? `Renames it; rules still saying {${editing}} need changing`
							: undefined
					}
					icon={rowIcon('CheckmarkLargeIcon', 'CircleCheckIcon')}
					disabled={!key || !!problem}
					onPress={save}
				/>
				{editing ? (
					<TableRow
						variant="danger"
						label="Delete placeholder"
						subLabel={
							usedIn
								? `Also deletes its value in ${usedIn} server${usedIn === 1 ? '' : 's'}`
								: undefined
						}
						icon={dangerIcon('TrashIcon')}
						onPress={() =>
							confirmDestructive({
								title: `Delete {${editing}}?`,
								body: 'Rules that use it will send the text as typed, braces and all, until you change them.',
								action: 'Delete',
								onConfirm: () => {
									deletePlaceholder(editing)
									navigation.goBack()
								},
							})
						}
					/>
				) : null}
			</TableRowGroup>

			{!editing ? (
				<Text variant="text-sm/normal" color="text-muted">
					After adding it, set a value for each server on that server's page.
				</Text>
			) : null}
		</WagonPage>
	)
}
