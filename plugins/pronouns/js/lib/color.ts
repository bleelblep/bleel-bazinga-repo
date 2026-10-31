/**
 * The badge's colour. The chat tag takes `tagBackgroundColor` / `tagTextColor` as processed colour
 * ints (the way Staff Tags colours its tags, `plugins/staff-tags/js/patches/chat.ts`). Unset keeps
 * Discord's own tag colour. Text is black or white, whichever reads on the background.
 */

import { Stores } from '@valenced/discord/flux'
import * as ReactNative from 'react-native'
import { settings } from './state'
import type { DiscordModules } from '@valenced/discord/types'

interface GuildMemberStore {
	getMember(
		guildId: string,
		userId: string,
	): { colorString?: string | null } | undefined
}

/** Preset swatches for the settings page. */
export const PRESETS = [
	'#5865F2',
	'#EB459E',
	'#ED4245',
	'#F0B232',
	'#57F287',
	'#3BA55C',
	'#00A8FC',
	'#9B59B6',
	'#99AAB5',
	'#23272A',
]

/** `#RRGGBB` for anything recognisable (`#abc`, `abcdef`, `240, 178, 50`), otherwise undefined. */
export function parseColor(input: string): string | undefined {
	const value = input.trim()
	if (!value) return undefined
	const hex = value.replace(/^#/, '')
	if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`
	if (/^[0-9a-f]{3}$/i.test(hex))
		return `#${hex
			.split('')
			.map(c => c + c)
			.join('')
			.toUpperCase()}`
	const rgb = value.match(
		/^rgba?\(?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i,
	)
	if (rgb) {
		const parts = [rgb[1], rgb[2], rgb[3]].map(n =>
			Number.parseInt(n ?? '', 10),
		)
		if (parts.every(n => n <= 255))
			return `#${parts
				.map(n => n.toString(16).padStart(2, '0'))
				.join('')
				.toUpperCase()}`
	}
	return undefined
}

/** Perceived brightness (ITU-R BT.601) below ~140 reads as dark. */
export function isDark(hex: string): boolean {
	const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex)
	if (!match) return true
	const [r, g, b] = [match[1], match[2], match[3]].map(n =>
		Number.parseInt(n ?? '', 16),
	)
	return ((r ?? 0) * 299 + (g ?? 0) * 587 + (b ?? 0) * 114) / 1000 < 140
}

export function textOn(background: string): string {
	return isDark(background) ? '#FFFFFF' : '#000000'
}

function roleColor(userId: string, guildId?: string): string | undefined {
	if (!guildId) return undefined
	try {
		const GuildMemberStore =
			Stores.GuildMemberStore as DiscordModules.Flux.Store<GuildMemberStore>
		const color = GuildMemberStore.getMember(guildId, userId)?.colorString
		return typeof color === 'string' ? parseColor(color) : undefined
	} catch {
		return undefined
	}
}

/** The background for this author's badge, or undefined for Discord's default. */
export function badgeColor(
	userId: string,
	guildId?: string,
): string | undefined {
	const s = settings()
	if (s.useRoleColor) {
		const role = roleColor(userId, guildId)
		if (role) return role
	}
	if (s.colorMode === 'perPerson') {
		const own = s.perPersonColors?.[userId]
		return (
			(typeof own === 'string' ? parseColor(own) : undefined) ??
			(parseColor(s.badgeColor) || undefined)
		)
	}
	return parseColor(s.badgeColor) || undefined
}

/** The extra tag fields for this author; empty for Discord's default colours. */
export function tagColorProps(
	userId: string,
	guildId?: string,
): Record<string, unknown> {
	const background = badgeColor(userId, guildId)
	if (!background) return {}
	const { processColor } = ReactNative
	return {
		tagBackgroundColor: processColor(background),
		tagTextColor: processColor(textOn(background)),
	}
}
