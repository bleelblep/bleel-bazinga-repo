/**
 * Discord's message markdown, drawn with React Native text for the Preview dialog (`lib/preview.ts`).
 *
 * Discord's own renderer is native (chat rows are drawn by the Kotlin side from a parsed tree), so
 * there is no JS component that turns a string into formatted text. Everything here is plain React
 * Native `Text` with Discord's own font files and theme colours. This covers what people actually
 * type, in Discord's order of precedence:
 *
 * - blocks: ``` code blocks ```, `>` and `>>>` quotes, `#`/`##`/`###` headings, `-#` subtext,
 *   `-`/`*`/`1.` lists;
 * - inline: `code`, ||spoilers|| (tap to reveal), **bold**, __underline__, *italic* / _italic_,
 *   ~~strike~~, [masked](links), bare links, and user/channel/role mentions, custom emoji and
 *   `<t:…>` timestamps shown the way Discord reads them out.
 *
 * Anything it doesn't know stays as typed, which is also what Discord does with it.
 */

import { Stores } from '@valenced/discord/flux'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { token } from './colours'
import type { DiscordModules } from '@valenced/discord/types'
import type { ReactNode } from 'react'
import type { TextStyle } from 'react-native'

type Node = any

const CODE_BG = 'rgba(128, 128, 128, 0.18)'
const QUOTE_BAR = 'rgba(128, 128, 128, 0.5)'

/**
 * Discord's bundled font files (`assets/fonts/` in the 348.5 APK). On Android, `fontWeight` and
 * `fontStyle` do nothing to a custom font: bold and italic only show when the exact file is named.
 * 0.5.3 set `fontWeight: '700'` inside Discord's design `Text` (which sets gg sans on every piece),
 * and nothing looked any different.
 */
const FONT = {
	normal: 'ggsans-Normal',
	italic: 'ggsans-NormalItalic',
	bold: 'ggsans-Bold',
	boldItalic: 'ggsans-BoldItalic',
	semibold: 'ggsans-Semibold',
	extraBold: 'ggsans-ExtraBold',
	mono: 'ggmono-Normal',
}

/** What the text around a span already carries, so nested bold and italic pick the right file. */
type Format = { bold?: boolean; italic?: boolean }

function fontFor(f: Format): string {
	if (f.bold && f.italic) return FONT.boldItalic
	if (f.bold) return FONT.bold
	if (f.italic) return FONT.italic
	return FONT.normal
}

type Store<T> = DiscordModules.Flux.Store<T>
/** The stores mention names come from, by the methods they need. */
interface MarkdownStores {
	ChannelStore?: Store<{
		getChannel?(id?: string): { name?: string; guild_id?: string } | undefined
	}>
	SelectedChannelStore?: Store<{ getChannelId?(): string | undefined }>
	GuildStore?: Store<{
		getRole?(guildId: string, roleId: string): { name?: string } | undefined
		getGuild?(
			guildId: string,
		): { roles?: Record<string, { name?: string } | undefined> } | undefined
	}>
	UserStore?: Store<{
		getUser?(
			id: string,
		): { globalName?: string | null; username?: string } | undefined
	}>
}

function stores(): MarkdownStores {
	return Stores as MarkdownStores
}

function mentionName(kind: string, id: string): string {
	try {
		if (kind === '#') {
			const channel = stores().ChannelStore?.getChannel?.(id)
			return channel?.name ? `#${channel.name}` : '#unknown-channel'
		}
		if (kind === '@&') {
			const channelId = stores().SelectedChannelStore?.getChannelId?.()
			const guildId = stores().ChannelStore?.getChannel?.(channelId)?.guild_id
			const role = guildId
				? (stores().GuildStore?.getRole?.(guildId, id) ??
					stores().GuildStore?.getGuild?.(guildId)?.roles?.[id])
				: undefined
			return role?.name ? `@${role.name}` : '@unknown-role'
		}
		const user = stores().UserStore?.getUser?.(id)
		return `@${user?.globalName || user?.username || 'unknown-user'}`
	} catch {
		return kind === '#' ? '#unknown-channel' : '@unknown'
	}
}

function timestamp(seconds: string, style: string | undefined): string {
	const date = new Date(Number(seconds) * 1000)
	if (Number.isNaN(date.getTime())) return `<t:${seconds}>`
	try {
		switch (style) {
			case 't':
				return date.toLocaleTimeString(undefined, {
					hour: 'numeric',
					minute: '2-digit',
				})
			case 'T':
				return date.toLocaleTimeString()
			case 'd':
				return date.toLocaleDateString()
			case 'D':
				return date.toLocaleDateString(undefined, { dateStyle: 'long' })
			case 'R': {
				const diff = Math.round((date.getTime() - Date.now()) / 1000)
				const abs = Math.abs(diff)
				const [n, unit] =
					abs < 60
						? [abs, 'second']
						: abs < 3600
							? [Math.round(abs / 60), 'minute']
							: abs < 86400
								? [Math.round(abs / 3600), 'hour']
								: [Math.round(abs / 86400), 'day']
				const label = `${n} ${unit}${n === 1 ? '' : 's'}`
				return diff >= 0 ? `in ${label}` : `${label} ago`
			}
			default:
				return date.toLocaleString()
		}
	} catch {
		return date.toISOString()
	}
}

/** A spoiler: blacked out until tapped, like Discord's. */
function Spoiler({ children }: { children: ReactNode }) {
	const { Text } = ReactNative
	const [shown, setShown] = React.useState(false)
	return (
		<Text
			onPress={() => setShown(true)}
			style={
				shown
					? { backgroundColor: CODE_BG }
					: { backgroundColor: '#1e1f22', color: 'transparent' }
			}
		>
			{children}
		</Text>
	)
}

/**
 * Inline rules, tried in order at every position; the first that matches there wins. Patterns are
 * anchored with `^` and run on the rest of the string, not with the sticky `y` flag, which Hermes
 * builds have not always supported.
 */
type Inner = (text: string, add?: Format) => Node[]
type Rule = {
	re: RegExp
	render: (m: RegExpExecArray, inner: Inner, key: string, f: Format) => Node
}

function inlineRules(): Rule[] {
	const { Text, Linking } = ReactNative
	const linkColour = token('TEXT_LINK', '#00a8fc')
	const link = (label: Node, url: string, key: string) => (
		<Text
			key={key}
			style={{ color: linkColour }}
			onPress={() => Linking.openURL(url).catch(() => {})}
		>
			{label}
		</Text>
	)
	const pill = (text: string, key: string) => (
		<Text
			key={key}
			style={{
				color: token('MENTION_FOREGROUND', '#c9cdfb'),
				backgroundColor: 'rgba(88, 101, 242, 0.3)',
				fontFamily: FONT.semibold,
			}}
		>
			{text}
		</Text>
	)
	const styled = (key: string, style: TextStyle, children: Node) => (
		<Text key={key} style={style}>
			{children}
		</Text>
	)
	return [
		{
			re: /^(?:``([^`]+?)``|`([^`\n]+?)`)/,
			render: (m, _, k) =>
				styled(
					k,
					{ fontFamily: FONT.mono, backgroundColor: CODE_BG },
					m[1] ?? m[2],
				),
		},
		{
			re: /^\|\|([\s\S]+?)\|\|/,
			render: (m, inner, k) => <Spoiler key={k}>{inner(m[1]!)}</Spoiler>,
		},
		{
			re: /^\*\*\*([\s\S]+?)\*\*\*(?!\*)/,
			render: (m, inner, k) =>
				styled(
					k,
					{ fontFamily: fontFor({ bold: true, italic: true }) },
					inner(m[1]!, { bold: true, italic: true }),
				),
		},
		{
			re: /^\*\*([\s\S]+?)\*\*(?!\*)/,
			render: (m, inner, k, f) =>
				styled(
					k,
					{ fontFamily: fontFor({ ...f, bold: true }) },
					inner(m[1]!, { bold: true }),
				),
		},
		{
			re: /^__([\s\S]+?)__(?!_)/,
			render: (m, inner, k) =>
				styled(k, { textDecorationLine: 'underline' }, inner(m[1]!)),
		},
		{
			re: /^~~([\s\S]+?)~~/,
			render: (m, inner, k) =>
				styled(k, { textDecorationLine: 'line-through' }, inner(m[1]!)),
		},
		{
			re: /^\*(?=\S)([\s\S]*?\S)\*(?!\*)/,
			render: (m, inner, k, f) =>
				styled(
					k,
					{ fontFamily: fontFor({ ...f, italic: true }) },
					inner(m[1]!, { italic: true }),
				),
		},
		{
			re: /^_((?:__|\\[\s\S]|[^\\_])+?)_(?![A-Za-z0-9_])/,
			render: (m, inner, k, f) =>
				styled(
					k,
					{ fontFamily: fontFor({ ...f, italic: true }) },
					inner(m[1]!, { italic: true }),
				),
		},
		{
			re: /^\[([^\]\n]+)\]\(<?(https?:\/\/[^\s)>]+)>?\)/,
			render: (m, inner, k) => link(inner(m[1]!), m[2]!, k),
		},
		{
			re: /^<(https?:\/\/[^\s>]+)>/,
			render: (m, _, k) => link(m[1]!, m[1]!, k),
		},
		{
			re: /^https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]/,
			render: (m, _, k) => link(m[0], m[0], k),
		},
		{
			re: /^<(@!?|@&|#)(\d{15,21})>/,
			render: (m, _, k) => pill(mentionName(m[1]!.replace('!', ''), m[2]!), k),
		},
		{
			re: /^@(everyone|here)(?![A-Za-z0-9_])/,
			render: (m, _, k) => pill(m[0], k),
		},
		{ re: /^<a?:(\w{2,32}):\d{15,21}>/, render: m => `:${m[1]}:` },
		{
			re: /^<t:(-?\d{1,13})(?::([tTdDfFR]))?>/,
			render: (m, _, k) => pill(timestamp(m[1]!, m[2]), k),
		},
		{ re: /^\\([^\sA-Za-z0-9])/, render: m => m[1] },
	]
}

/** Where a rule could start: anything else is copied through as plain text without trying them all. */
const TRIGGER = /[`|*_~[<h@\\]/

/** Inline formatting inside one block of text. [f] is what the surrounding text already carries. */
export function renderInline(
	text: string,
	keyPrefix = 'i',
	f: Format = {},
): Node[] {
	const rules = inlineRules()
	const out: Node[] = []
	let plain = ''
	let i = 0
	let n = 0
	// A single `_` only opens italics at a word start, as in Discord.
	const wordBefore = (at: number) => at > 0 && /[A-Za-z0-9]/.test(text[at - 1]!)
	outer: while (i < text.length) {
		const ch = text[i]!
		if (
			TRIGGER.test(ch) &&
			!(ch === '_' && text[i + 1] !== '_' && wordBefore(i))
		) {
			const rest = text.slice(i)
			for (const rule of rules) {
				const m = rule.re.exec(rest)
				if (m?.[0].length) {
					if (plain) out.push(plain)
					plain = ''
					const key = `${keyPrefix}.${n++}`
					const inner: Inner = (t, add) =>
						renderInline(t, key, { ...f, ...add })
					out.push(rule.render(m, inner, key, f))
					i += m[0].length
					continue outer
				}
			}
		}
		plain += ch
		i++
	}
	if (plain) out.push(plain)
	return out
}

type Block =
	| { kind: 'code'; text: string }
	| { kind: 'quote'; lines: string[] }
	| { kind: 'heading'; level: number; text: string }
	| { kind: 'subtext'; text: string }
	| {
			kind: 'list'
			items: Array<{ marker: string; text: string; depth: number }>
	  }
	| { kind: 'text'; lines: string[] }

export function parseBlocks(source: string): Block[] {
	const blocks: Block[] = []
	const lines = source.replace(/\r\n?/g, '\n').split('\n')
	let i = 0
	const lastText = () => {
		const last = blocks[blocks.length - 1]
		return last?.kind === 'text' ? last : undefined
	}
	while (i < lines.length) {
		const line = lines[i]!

		// ``` fenced code, to the closing fence or the end.
		const fence = /^\s*```(\w*)(.*)$/.exec(line)
		if (fence) {
			const rest = fence[2] ?? ''
			// On one line (```like this```) there is no language: the first word is code too.
			const oneLine = (fence[1] ?? '') + rest
			const close = oneLine.indexOf('```')
			if (close !== -1) {
				blocks.push({ kind: 'code', text: oneLine.slice(0, close) })
				i++
				continue
			}
			const body: string[] = rest.trim() ? [rest] : []
			i++
			while (i < lines.length && !/```/.test(lines[i]!)) body.push(lines[i++]!)
			if (i < lines.length) {
				const tail = lines[i]!.slice(0, lines[i]!.indexOf('```'))
				if (tail) body.push(tail)
				i++
			}
			blocks.push({ kind: 'code', text: body.join('\n') })
			continue
		}

		// >>> quotes everything after it.
		const multi = /^>>> ?(.*)$/.exec(line)
		if (multi) {
			blocks.push({ kind: 'quote', lines: [multi[1]!, ...lines.slice(i + 1)] })
			break
		}
		const quote = /^> ?(.*)$/.exec(line)
		if (quote) {
			const last = blocks[blocks.length - 1]
			if (last?.kind === 'quote') last.lines.push(quote[1]!)
			else blocks.push({ kind: 'quote', lines: [quote[1]!] })
			i++
			continue
		}

		const heading = /^(#{1,3}) +(.+)$/.exec(line)
		if (heading) {
			blocks.push({
				kind: 'heading',
				level: heading[1]!.length,
				text: heading[2]!,
			})
			i++
			continue
		}
		const subtext = /^-# +(.+)$/.exec(line)
		if (subtext) {
			blocks.push({ kind: 'subtext', text: subtext[1]! })
			i++
			continue
		}
		const item = /^(\s*)([-*]|\d{1,9}\.) +(.+)$/.exec(line)
		if (item) {
			const entry = {
				marker: /\d/.test(item[2]!) ? item[2]! : '•',
				text: item[3]!,
				depth: Math.min(2, Math.floor(item[1]!.length / 2)),
			}
			const last = blocks[blocks.length - 1]
			if (last?.kind === 'list') last.items.push(entry)
			else blocks.push({ kind: 'list', items: [entry] })
			i++
			continue
		}

		const text = lastText()
		if (text) text.lines.push(line)
		else blocks.push({ kind: 'text', lines: [line] })
		i++
	}
	return blocks
}

/** The whole message, as a column of blocks, in the theme's text colours. */
export function renderMarkdown(source: string): Node {
	const { View, Text } = ReactNative
	const textColour = token('TEXT_DEFAULT', '#dbdee1')
	const mutedColour = token('TEXT_MUTED', '#949ba4')

	const base = {
		color: textColour,
		fontFamily: FONT.normal,
		fontSize: 16,
		lineHeight: 22,
	}
	const body = (
		text: string,
		key: string,
		style: TextStyle = {},
		f: Format = {},
	) => (
		<Text key={key} selectable style={{ ...base, ...style }}>
			{renderInline(text, key, f)}
		</Text>
	)

	const blocks = parseBlocks(source)
	return (
		<View style={{ gap: 4 }}>
			{blocks.map((block, index) => {
				const key = `b${index}`
				switch (block.kind) {
					case 'code':
						return (
							<View
								key={key}
								style={{
									backgroundColor: CODE_BG,
									borderRadius: 4,
									padding: 8,
								}}
							>
								<Text
									selectable
									style={{
										...base,
										fontFamily: FONT.mono,
										fontSize: 14,
										lineHeight: 18,
									}}
								>
									{block.text}
								</Text>
							</View>
						)
					case 'quote':
						return (
							<View key={key} style={{ flexDirection: 'row' }}>
								<View
									style={{
										width: 4,
										borderRadius: 2,
										backgroundColor: QUOTE_BAR,
										marginRight: 8,
									}}
								/>
								<View style={{ flex: 1 }}>
									{renderMarkdown(block.lines.join('\n'))}
								</View>
							</View>
						)
					case 'heading': {
						const size = block.level === 1 ? 24 : block.level === 2 ? 20 : 18
						return body(
							block.text,
							key,
							{
								fontFamily: block.level === 1 ? FONT.extraBold : FONT.bold,
								fontSize: size,
								lineHeight: size + 6,
							},
							{ bold: true },
						)
					}
					case 'subtext':
						return body(block.text, key, {
							color: mutedColour,
							fontSize: 12,
							lineHeight: 16,
						})
					case 'list':
						return (
							<View key={key} style={{ gap: 2 }}>
								{block.items.map((entry, j) => (
									<View
										key={j}
										style={{
											flexDirection: 'row',
											paddingLeft: entry.depth * 16,
										}}
									>
										<Text style={{ ...base, width: 22 }}>{entry.marker}</Text>
										<View style={{ flex: 1 }}>
											{body(entry.text, `${key}.${j}`)}
										</View>
									</View>
								))}
							</View>
						)
					default:
						return body(block.lines.join('\n'), key)
				}
			})}
		</View>
	)
}
