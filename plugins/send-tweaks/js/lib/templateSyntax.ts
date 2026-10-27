/** Explicit local date/time formatting; date accepts lowercase dd/mm/yy as a convenience. */
export function formatLocal(
	date: Date,
	format: string,
	kind: 'date' | 'time',
): string | undefined {
	const pattern =
		kind === 'date'
			? format.replace(/d/g, 'D').replace(/m/g, 'M').replace(/y/g, 'Y')
			: format
	const values: Record<string, string> = {
		YYYY: String(date.getFullYear()),
		YY: String(date.getFullYear()).slice(-2),
		MM: String(date.getMonth() + 1).padStart(2, '0'),
		DD: String(date.getDate()).padStart(2, '0'),
		HH: String(date.getHours()).padStart(2, '0'),
		hh: String(date.getHours() % 12 || 12).padStart(2, '0'),
		mm: String(date.getMinutes()).padStart(2, '0'),
		ss: String(date.getSeconds()).padStart(2, '0'),
		A: date.getHours() < 12 ? 'AM' : 'PM',
	}
	const tokens = kind === 'date' ? /YYYY|YY|MM|DD/g : /HH|hh|mm|ss|A/g
	if (/[A-Za-z]/.test(pattern.replace(tokens, ''))) return undefined
	return pattern.replace(tokens, token => values[token])
}

export function discordTimestamp(
	date: Date,
	argument = 'f',
): string | undefined {
	const match = /^(?:([+-]\d+)([mhd])(?::([tTdDfFR]))?|([tTdDfFR]))$/.exec(
		argument,
	)
	if (!match || !Number.isFinite(date.getTime())) return undefined
	const seconds =
		Math.floor(date.getTime() / 1000) +
		(match[1]
			? Number(match[1]) * ({ m: 60, h: 3600, d: 86400 }[match[2]] ?? 0)
			: 0)
	if (!Number.isSafeInteger(seconds) || Math.abs(seconds * 1000) > 8.64e15)
		return undefined
	return `<t:${seconds}:${match[3] ?? match[4] ?? 'f'}>`
}

export interface Snippet {
	name: string
	text: string
}

/** Expand bounded references, keeping missing/cyclic references visible for diagnostics. */
export function expandSnippets(
	text: string,
	snippets: Snippet[],
	chain: string[] = [],
): string {
	let budget = 64000 - text.length
	return text.replace(/\{snippet:([\w-]+)\}/g, (token, name: string) => {
		if (chain.includes(name) || chain.length >= 8) return token
		const snippet = snippets.find(entry => entry.name === name)
		if (!snippet || snippet.text.length > 32000) return token
		const expanded = expandSnippets(snippet.text, snippets, [...chain, name])
		const growth = expanded.length - token.length
		if (expanded.length > 32000 || growth > budget) return token
		budget -= growth
		return expanded
	})
}

export type RuleScope = {
	kind: 'all' | 'servers' | 'channels' | 'dms'
	ids?: string[]
}

export function scopeMatches(
	scope: RuleScope | undefined,
	channelId?: string,
	guildId?: string,
	channelType?: number,
): boolean {
	if (!scope || scope.kind === 'all') return true
	if (scope.kind === 'channels')
		return !!channelId && !!scope.ids?.includes(channelId)
	if (scope.kind === 'servers')
		return !!guildId && !!scope.ids?.includes(guildId)
	return scope.kind === 'dms' && (channelType === 1 || channelType === 3)
}
