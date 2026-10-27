/**
 * Greeting placeholders for text rules: `{greeting} {mention}, welcome to {server}!`
 *
 * Not listed anywhere until unlocked. Typing the unlock phrase into a rule's Find field turns it on
 * for this device (see `tryUnlock`); only its SHA-256 is stored here, so the source never spells
 * the phrase out. Locked, the placeholders are plain text and rules behave exactly as before.
 *
 * ## Who `{mention}` is
 *
 * The person you are replying to, read from the send's message reference and, failing that, from
 * Discord's pending reply. Not replying, it is the newest member who joined in this channel (the
 * "X joined the server" system message). Nobody found: `{mention}` is empty and `{name}` is "there".
 */

import { Stores } from '@valenced/discord/flux'
import { reportError } from '../../../../shared/report'
import { getStorage, settings, TAG } from './state'
import { discordTimestamp, formatLocal, scopeMatches } from './templateSyntax'
import {
	customValue,
	isCustomPlaceholder,
	usesWagon,
	wagonOffIn,
} from './wagon'
import type { DiscordModules } from '@valenced/discord/types'
import type { RuleScope } from './templateSyntax'

/** SHA-256 of the unlock phrase, after `normalize`. */
const UNLOCK_HASH =
	'bcbfa284fdf9f1f16c505b7b04c319a3545fba81af5824d2f8a79c2e89945779'

/** Discord's "X joined the server" system message. */
const USER_JOIN = 7

export const PLACEHOLDERS = [
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
] as const

export function greetingsUnlocked(): boolean {
	return settings().greetingsUnlocked === true
}

/** A built-in placeholder or one of your own (lib/wagon.ts). */
export function isKnownPlaceholder(key: string): boolean {
	return (
		(PLACEHOLDERS as readonly string[]).includes(key) ||
		isCustomPlaceholder(key)
	)
}

/** The rule's replacement. Kept as one place to resolve it; per-server text was removed in 1.0.2. */
export function replacementFor(rule: { replace: string }): string {
	return rule.replace
}

/**
 * False where Welcome Wagon is turned off for this server and the rule's replacement uses it, so the
 * rule is skipped there instead of sending half-filled text (lib/wagon.ts).
 */
export function wagonAllowsRule(replacement: string): boolean {
	if (!greetingsUnlocked() || context?.sample) return true
	return !(wagonOffIn(channel()?.guild_id) && usesWagon(replacement))
}

const normalize = (text: string) =>
	text.trim().toLowerCase().replace(/\s+/g, ' ')

/** Unlocks on the phrase. True only the moment it unlocks, so the caller can say so once. */
export function tryUnlock(text: string): boolean {
	if (greetingsUnlocked() || text.length > 64) return false
	if (sha256(normalize(text)) !== UNLOCK_HASH) return false
	getStorage()?.set({ greetingsUnlocked: true })
	return true
}

// --- Send context ---------------------------------------------------------------------------

interface SendContext {
	channelId?: string
	replyToId?: string
	/** Playground data is explicit and never mixed with real Discord identities. */
	sample?: Record<string, string | undefined>
	now?: Date
}

let context: SendContext | undefined

/** Runs `fn` with the channel and reply target of the message being sent. */
export function withSendContext<T>(next: SendContext, fn: () => T): T {
	const previous = context
	context = next
	try {
		return fn()
	} finally {
		context = previous
	}
}

// --- Expansion -------------------------------------------------------------------------------

/**
 * Turns any text into Discord's ANSI rainbow codeblock:
 * Cycles through 6 ANSI foreground colors (red, yellow, green, cyan, blue, magenta)
 * for infinite characters.
 */
export function toRainbowAnsi(text: string, bold = false): string {
	const fmt = bold ? '1' : '0'
	const RAINBOW = [
		`${fmt};31`,
		`${fmt};33`,
		`${fmt};32`,
		`${fmt};36`,
		`${fmt};34`,
		`${fmt};35`,
	]
	let colorIndex = 0
	let out = '```ansi\n'
	for (const char of text) {
		if (char === '\n') {
			out += '\n'
			continue
		}
		if (char === ' ' || char === '\t') {
			out += char
			continue
		}
		const color = RAINBOW[colorIndex % RAINBOW.length]
		out += `\u001b[${color}m${char}`
		colorIndex++
	}
	out += '\u001b[0m\n```'
	return out
}

export function expandDynamicPlaceholders(text: string): string {
	if (!text.includes('{rainbow') && !text.includes('{gradient')) return text
	return text.replace(
		/\{(?:rainbow|gradient)(?::(bold|b))?:([\s\S]*?)\}/g,
		(_, boldOpt, content) => {
			return toRainbowAnsi(content, Boolean(boldOpt))
		},
	)
}

/**
 * Fills the placeholders in a rule's replacement. `replacement` goes on to `String.replace`, so
 * every value has its `$` doubled to stay literal. Each value is worked out at most once per call.
 */
export function expandPlaceholders(replacement: string): string {
	if (!replacement.includes('{')) return replacement
	const unlocked = greetingsUnlocked()
	if (!unlocked && !replacement.includes('{timestamp')) return replacement

	const cache = new Map<string, string>()
	const now = context?.now ?? new Date()
	return replacement.replace(
		/\{(\w+)(?::([^{}|]+))?(?:\|([^{}]*))?\}/g,
		(
			token,
			key: string,
			argument: string | undefined,
			fallback: string | undefined,
		) => {
			const custom =
				unlocked &&
				!argument &&
				!(PLACEHOLDERS as readonly string[]).includes(key)
					? customValue(key, context?.sample ? undefined : channel()?.guild_id)
					: undefined
			if (custom !== undefined) {
				const value = custom || fallback || ''
				return value.replace(/\$/g, '$$$$')
			}
			if (!(PLACEHOLDERS as readonly string[]).includes(key)) return token
			const cacheKey = `${key}:${argument ?? ''}:${fallback ?? ''}`
			if (!cache.has(cacheKey)) {
				let value = ''
				try {
					if (key === 'timestamp') {
						const stamp = discordTimestamp(now, argument)
						if (!stamp) return token
						value = stamp
					} else if (key === 'date' || key === 'time') {
						const format =
							argument ??
							(key === 'date' ? settings().dateFormat : settings().timeFormat)
						const formatted = format
							? formatLocal(now, format, key)
							: resolve(key, now)
						if (formatted === undefined) return token
						value = formatted
					} else if (key === 'joined' || key === 'created') {
						if (argument && !/^[tTdDfFR]$/.test(argument)) return token
						const date = targetDate(key)
						value = date ? (discordTimestamp(date, argument ?? 'f') ?? '') : ''
					} else {
						if (argument) return token
						value =
							context?.sample && key !== 'greeting'
								? (context.sample[key] ?? '')
								: key === 'name' && !target()
									? ''
									: resolve(key, now)
					}
				} catch (error) {
					reportError(`${TAG} placeholder {${key}} failed:`, error)
				}
				if (!value) value = fallback ?? (key === 'name' ? 'there' : '')
				cache.set(cacheKey, value.replace(/\$/g, '$$$$'))
			}
			return cache.get(cacheKey)!
		},
	)
}

interface GreetingUser {
	id: string
	username?: string
	globalName?: string | null
	global_name?: string | null
}

interface GreetingMessage {
	type?: number
	author?: GreetingUser
}

interface GreetingChannel {
	guild_id?: string
	type?: number
}

type Store<T> = DiscordModules.Flux.Store<T>
/** The stores greetings read, by the methods they need. */
interface GreetingStores {
	SelectedChannelStore?: Store<{ getChannelId?(): string | undefined }>
	ChannelStore?: Store<{ getChannel?(id: string): GreetingChannel | undefined }>
	GuildStore?: Store<{
		getGuild?(
			id?: string,
		):
			| { name?: string; memberCount?: number; member_count?: number }
			| undefined
	}>
	GuildMemberStore?: Store<{
		getNick?(guildId: string, userId: string): string | null | undefined
		getMember?(
			guildId: string,
			userId: string,
		): { joinedAt?: string | number; joined_at?: string | number } | undefined
	}>
	UserStore?: Store<{ getCurrentUser?(): GreetingUser | undefined }>
	MessageStore?: Store<{
		getMessage?(channelId: string, id: string): GreetingMessage | undefined
		getMessages?(
			channelId: string,
		): { toArray?(): GreetingMessage[]; _array?: GreetingMessage[] } | undefined
	}>
	PendingReplyStore?: Store<{
		getPendingReply?(
			channelId: string,
		): { message?: GreetingMessage } | undefined
	}>
}

function stores(): GreetingStores {
	return Stores as GreetingStores
}

function channelId(): string | undefined {
	return context?.channelId ?? stores().SelectedChannelStore?.getChannelId?.()
}

export function ruleScopeMatches(scope?: RuleScope): boolean {
	if (!scope || scope.kind === 'all') return true
	if (!greetingsUnlocked()) return false
	const current = channel()
	return scopeMatches(scope, channelId(), current?.guild_id, current?.type)
}

function targetDate(kind: 'joined' | 'created'): Date | undefined {
	if (context?.sample) {
		const value = context.sample[kind]
		const date = value ? new Date(value) : undefined
		return date && Number.isFinite(date.getTime()) ? date : undefined
	}
	const user = target()
	if (!user?.id) return undefined
	if (kind === 'created') {
		if (!/^\d{15,22}$/.test(user.id)) return undefined
		// Snowflake timestamp: dropping the lower 22 bits remains within safe millisecond precision.
		return new Date(Math.floor(Number(user.id) / 4194304) + 1420070400000)
	}
	const guildId = channel()?.guild_id
	const member = guildId
		? stores().GuildMemberStore?.getMember?.(guildId, user.id)
		: undefined
	const value = member?.joinedAt ?? member?.joined_at
	const date = value == null ? undefined : new Date(value)
	return date && Number.isFinite(date.getTime()) ? date : undefined
}

function resolve(key: string, now: Date): string {
	switch (key) {
		case 'username':
			return target()?.username ?? ''
		case 'displayname': {
			const user = target()
			return user?.globalName ?? user?.global_name ?? user?.username ?? ''
		}
		case 'servercount': {
			const guild = stores().GuildStore?.getGuild?.(channel()?.guild_id)
			const count = guild?.memberCount ?? guild?.member_count
			return typeof count === 'number' ? String(count) : ''
		}
		case 'greeting': {
			const hour = now.getHours()
			return hour >= 5 && hour < 12
				? 'Good morning'
				: hour >= 12 && hour < 18
					? 'Good afternoon'
					: 'Good evening'
		}
		case 'date':
			return now.toLocaleDateString()
		case 'time':
			return now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
		case 'mention': {
			const user = target()
			return user?.id ? `<@${user.id}>` : ''
		}
		case 'name': {
			const user = target()
			return user ? displayName(user) : 'there'
		}
		case 'me': {
			const user = stores().UserStore?.getCurrentUser?.()
			return user ? displayName(user) : ''
		}
		case 'server': {
			const guildId = channel()?.guild_id
			return guildId
				? (stores().GuildStore?.getGuild?.(guildId)?.name ?? '')
				: ''
		}
		case 'channel': {
			const id = channelId()
			return id ? `<#${id}>` : ''
		}
	}
	return ''
}

function channel(): GreetingChannel | undefined {
	const id = channelId()
	return id ? stores().ChannelStore?.getChannel?.(id) : undefined
}

/** Server nickname, then display name, then username. */
function displayName(user: GreetingUser): string {
	const guildId = channel()?.guild_id
	const nick = guildId
		? stores().GuildMemberStore?.getNick?.(guildId, user.id)
		: undefined
	return nick || user.globalName || user.global_name || user.username || 'there'
}

/** The person being greeted: see "Who `{mention}` is" above. */
function target(): GreetingUser | undefined {
	const id = channelId()
	if (!id) return undefined
	const { MessageStore, PendingReplyStore } = stores()

	if (context?.replyToId) {
		const replied = MessageStore?.getMessage?.(id, context.replyToId)
		if (replied?.author) return replied.author
	}
	const pending = PendingReplyStore?.getPendingReply?.(id)?.message
	if (pending?.author) return pending.author

	const messages = MessageStore?.getMessages?.(id)
	const list: GreetingMessage[] =
		messages?.toArray?.() ?? messages?._array ?? []
	for (let i = list.length - 1; i >= 0; i--) {
		if (list[i]?.type === USER_JOIN && list[i].author) return list[i].author
	}
	return undefined
}

export function hasGreetingTarget(): boolean {
	return context?.sample ? !!context.sample.mention : !!target()?.id
}

// --- SHA-256 -------------------------------------------------------------------------------------

const K = [
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
	0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
	0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
	0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
	0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
	0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
	0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function utf8(text: string): number[] {
	const out: number[] = []
	for (const char of text) {
		const code = char.codePointAt(0)!
		if (code < 0x80) out.push(code)
		else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63))
		else if (code < 0x10000)
			out.push(
				0xe0 | (code >> 12),
				0x80 | ((code >> 6) & 63),
				0x80 | (code & 63),
			)
		else
			out.push(
				0xf0 | (code >> 18),
				0x80 | ((code >> 12) & 63),
				0x80 | ((code >> 6) & 63),
				0x80 | (code & 63),
			)
	}
	return out
}

/** Hex SHA-256 of a string's UTF-8 bytes. Hermes has no `crypto`, and this only hashes one phrase. */
export function sha256(text: string): string {
	const bytes = utf8(text)
	const bitLength = bytes.length * 8
	bytes.push(0x80)
	while (bytes.length % 64 !== 56) bytes.push(0)
	for (let i = 7; i >= 0; i--)
		bytes.push(i >= 4 ? 0 : (bitLength >>> (i * 8)) & 0xff)

	const h = [
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
		0x1f83d9ab, 0x5be0cd19,
	]
	const w = new Array<number>(64)
	const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

	for (let offset = 0; offset < bytes.length; offset += 64) {
		for (let i = 0; i < 16; i++) {
			const j = offset + i * 4
			w[i] =
				(bytes[j] << 24) |
				(bytes[j + 1] << 16) |
				(bytes[j + 2] << 8) |
				bytes[j + 3]
		}
		for (let i = 16; i < 64; i++) {
			const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
			const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
		}
		let [a, b, c, d, e, f, g, hh] = h
		for (let i = 0; i < 64; i++) {
			const t1 =
				(hh +
					(rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) +
					((e & f) ^ (~e & g)) +
					K[i] +
					w[i]) |
				0
			const t2 =
				((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) +
					((a & b) ^ (a & c) ^ (b & c))) |
				0
			hh = g
			g = f
			f = e
			e = (d + t1) | 0
			d = c
			c = b
			b = a
			a = (t1 + t2) | 0
		}
		h[0] = (h[0] + a) | 0
		h[1] = (h[1] + b) | 0
		h[2] = (h[2] + c) | 0
		h[3] = (h[3] + d) | 0
		h[4] = (h[4] + e) | 0
		h[5] = (h[5] + f) | 0
		h[6] = (h[6] + g) | 0
		h[7] = (h[7] + hh) | 0
	}
	return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('')
}
