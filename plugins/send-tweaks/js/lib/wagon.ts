/**
 * Welcome Wagon per-server settings (only reachable once Welcome Wagon is unlocked, see greetings.ts).
 *
 * - Your own placeholders: `{rules}`, `{staff}`... each with a default value and an optional value per
 *   server, so one greeting rule can point at the right channel in every server.
 * - On/off per server: in a server where Welcome Wagon is off, rules whose replacement uses any
 *   Welcome Wagon feature (placeholders, snippets, random choices) are skipped there, so the message
 *   goes out as typed instead of with raw `{name}` text in it. Plain rules still run.
 *
 * Both lists are arrays and always written whole: `jsonStorage.set()` replaces arrays, so a deleted
 * entry stays deleted (see `rules` in types.ts).
 */

import { Stores } from '@valenced/discord/flux'
import { getStorage, settings } from './state'
import type { DiscordModules } from '@valenced/discord/types'

export interface WagonPlaceholder {
	/** Lowercase, used as `{key}`. */
	key: string
	/** Used in servers with no value of their own, and in DMs. */
	value: string
}

export interface WagonServer {
	guildId: string
	/** Name when it was added, for servers you have since left. */
	name?: string
	/** Welcome Wagon is off in this server. */
	off?: boolean
	/** Placeholder key -> this server's value. Missing or blank = the default. */
	values?: Record<string, string>
}

/** Built-in names and template syntax a custom placeholder can't take. */
const RESERVED = new Set([
	'greeting',
	'mention',
	'name',
	'server',
	'channel',
	'me',
	'date',
	'time',
	'timestamp',
	'username',
	'displayname',
	'servercount',
	'joined',
	'created',
	'rainbow',
	'gradient',
	'snippet',
	'random',
	'shuffle',
])

export function wagonPlaceholders(): WagonPlaceholder[] {
	return settings().wagonPlaceholders ?? []
}

export function wagonServers(): WagonServer[] {
	return settings().wagonServers ?? []
}

export function wagonServer(
	guildId: string | undefined,
): WagonServer | undefined {
	return guildId
		? wagonServers().find(server => server.guildId === guildId)
		: undefined
}

/** Lowercases and strips braces; returns why a key can't be used, or undefined when it can. */
export function normalizeKey(raw: string): string {
	return raw
		.trim()
		.replace(/^\{|\}$/g, '')
		.trim()
		.toLowerCase()
}

export function keyProblem(key: string, editing?: string): string | undefined {
	if (!key) return 'Give it a name.'
	if (!/^[a-z][a-z0-9_]{0,23}$/.test(key))
		return 'Use letters, numbers and _ only, starting with a letter (up to 24).'
	if (RESERVED.has(key)) return `{${key}} is already a built-in placeholder.`
	if (key !== editing && wagonPlaceholders().some(entry => entry.key === key))
		return `You already have {${key}}.`
	return undefined
}

export function isCustomPlaceholder(key: string): boolean {
	return wagonPlaceholders().some(entry => entry.key === key)
}

/** `{key}`'s value in [guildId]: the server's own, else the default. Undefined if no such placeholder. */
export function customValue(
	key: string,
	guildId: string | undefined,
): string | undefined {
	const entry = wagonPlaceholders().find(item => item.key === key)
	if (!entry) return undefined
	const own = wagonServer(guildId)?.values?.[key]
	return own?.trim() ? own : entry.value
}

export function wagonOffIn(guildId: string | undefined): boolean {
	return wagonServer(guildId)?.off === true
}

/** Whether a replacement uses a Welcome Wagon feature (anything but timestamps and rainbow text). */
export function usesWagon(replacement: string): boolean {
	return /\{(?!(?:timestamp|rainbow|gradient)\b)\w|\$(?:random|shuffle)\{/.test(
		replacement,
	)
}

// --- Writes -------------------------------------------------------------------------------------

function save(patch: {
	wagonPlaceholders?: WagonPlaceholder[]
	wagonServers?: WagonServer[]
}) {
	getStorage()?.set(patch)
}

/** Adds or replaces a placeholder. Renaming carries every server's value over to the new key. */
export function savePlaceholder(entry: WagonPlaceholder, previousKey?: string) {
	const list = wagonPlaceholders().filter(
		item => item.key !== entry.key && item.key !== previousKey,
	)
	const at = previousKey
		? wagonPlaceholders().findIndex(item => item.key === previousKey)
		: -1
	list.splice(at >= 0 ? at : list.length, 0, entry)
	const patch: Parameters<typeof save>[0] = { wagonPlaceholders: list }
	if (previousKey && previousKey !== entry.key) {
		patch.wagonServers = wagonServers().map(server => {
			if (!server.values || !(previousKey in server.values)) return server
			const { [previousKey]: value, ...rest } = server.values
			return { ...server, values: { ...rest, [entry.key]: value } }
		})
	}
	save(patch)
}

export function deletePlaceholder(key: string) {
	save({
		wagonPlaceholders: wagonPlaceholders().filter(item => item.key !== key),
		wagonServers: wagonServers().map(server => {
			if (!server.values || !(key in server.values)) return server
			const { [key]: _, ...rest } = server.values
			return { ...server, values: rest }
		}),
	})
}

export function addServer(guildId: string, name?: string) {
	if (wagonServer(guildId)) return
	save({ wagonServers: [...wagonServers(), { guildId, name }] })
}

export function updateServer(
	guildId: string,
	change: (server: WagonServer) => WagonServer,
) {
	save({
		wagonServers: wagonServers().map(server =>
			server.guildId === guildId ? change(server) : server,
		),
	})
}

export function removeServer(guildId: string) {
	save({
		wagonServers: wagonServers().filter(server => server.guildId !== guildId),
	})
}

// --- Discord ------------------------------------------------------------------------------------

type Store<T> = DiscordModules.Flux.Store<T>
/** The stores Welcome Wagon reads, by the methods it needs. */
interface WagonStores {
	GuildStore?: Store<{
		getGuilds?(): Record<string, { id?: string; name?: string } | undefined>
		getGuild?(id: string): { name?: string } | undefined
	}>
	SelectedChannelStore?: Store<{ getChannelId?(): string | undefined }>
	ChannelStore?: Store<{
		getChannel?(id: string): { guild_id?: string } | undefined
	}>
}

function stores(): WagonStores {
	return Stores as WagonStores
}

/** Every server you're in, by name. */
export function joinedServers(): Array<{ id: string; name: string }> {
	const guilds = stores().GuildStore?.getGuilds?.() ?? {}
	return Object.values(guilds)
		.filter(
			(guild): guild is { id: string; name?: string } =>
				typeof guild?.id === 'string',
		)
		.map(guild => ({ id: guild.id, name: String(guild.name ?? guild.id) }))
		.sort((a, b) => a.name.localeCompare(b.name))
}

export function serverName(server: WagonServer): string {
	return (
		stores().GuildStore?.getGuild?.(server.guildId)?.name ??
		server.name ??
		server.guildId
	)
}

/** The server of the channel open right now, if any. */
export function currentGuildId(): string | undefined {
	const channelId = stores().SelectedChannelStore?.getChannelId?.()
	return channelId
		? (stores().ChannelStore?.getChannel?.(channelId)?.guild_id ?? undefined)
		: undefined
}
