/**
 * Reading rules shared as text, in the format of Fiery's Text Replace plugin for Vendetta/Bunny:
 *
 * ```json
 * { "name": "Twitter to fxtwitter", "match": "https?:\\/\\/twitter\\.com(?=\\/\\w+?\\/status\\/)",
 *   "flags": "g", "replace": "https://fxtwitter.com", "regex": true }
 * ```
 *
 * That plugin's users shared rules in Discord as JSON, often in ```json code blocks, so what gets
 * pasted here is anything from one bare object to a whole message of text with several blocks in it.
 * Every JSON object or array found is tried; anything that is not a rule is reported, not guessed at.
 *
 * Mapping: `match` -> `find`, `flags` `i` -> not case-sensitive, `m`/`s`/`u` kept as `extraFlags`.
 * Text Replace had no whole-word option, so imported rules have it off -- matching what they did there.
 */

import { compileRule, newRule, sanitizeFlags } from './textReplace'
import type { Rule } from './textReplace'

export interface ImportResult {
	rules: Rule[]
	/** One line per thing that was not imported, and why. */
	skipped: string[]
}

/** Pulls every top-level JSON object or array out of free text: code blocks, chat, or bare JSON. */
function jsonChunks(text: string): string[] {
	const chunks: string[] = []
	let depth = 0
	let start = -1
	let inString = false
	let escaped = false
	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		if (inString) {
			if (escaped) escaped = false
			else if (char === '\\') escaped = true
			else if (char === '"') inString = false
			continue
		}
		if (char === '"' && depth > 0) inString = true
		else if (char === '{' || char === '[') {
			if (depth === 0) start = i
			depth++
		} else if ((char === '}' || char === ']') && depth > 0) {
			depth--
			if (depth === 0 && start >= 0) {
				chunks.push(text.slice(start, i + 1))
				start = -1
			}
		}
	}
	// Keep incomplete JSON so parsing reports a broken/truncated block rather than "No rule found".
	if (start >= 0 && depth > 0) chunks.push(text.slice(start))
	return chunks
}

const SCOPE_KINDS = ['all', 'servers', 'channels', 'dms'] as const

function toRule(input: unknown, label: string): Rule | string {
	if (!input || typeof input !== 'object' || Array.isArray(input))
		return `${label}: not a rule`
	// Keys in any case: rules get shared as "Match", "Replace", "Regex" as often as lower case.
	const raw: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(input))
		raw[key.toLowerCase()] = value
	const find =
		typeof raw.match === 'string'
			? raw.match
			: typeof raw.find === 'string'
				? raw.find
				: ''
	if (!find) return `${label}: has no "match"`
	const replace = raw.replace
	if (typeof replace !== 'string') return `${label}: has no "replace"`

	const flags = typeof raw.flags === 'string' ? raw.flags : 'g'
	const scope =
		typeof raw.scope === 'object' && raw.scope !== null
			? (raw.scope as { kind?: unknown; ids?: unknown })
			: undefined
	const scopeKind = SCOPE_KINDS.find(kind => kind === scope?.kind)
	const ids = scope?.ids
	const rule = newRule({
		name:
			typeof raw.name === 'string' && raw.name.trim()
				? raw.name.trim()
				: undefined,
		find,
		scope: scopeKind
			? {
					kind: scopeKind,
					ids: Array.isArray(ids)
						? ids.filter((id): id is string => typeof id === 'string')
						: [],
				}
			: undefined,
		replace,
		regex: raw.regex === true,
		caseSensitive: !flags.includes('i'),
		wholeWord: typeof raw.wholeword === 'boolean' ? raw.wholeword : false,
		live: raw.live === true,
		extraFlags: sanitizeFlags(flags) || undefined,
	})
	const compiled = compileRule(rule)
	if (compiled.error) return `${rule.name ?? label}: ${compiled.error}`
	return rule
}

/**
 * Makes hand-written rules parse: line breaks and tabs inside strings are escaped, and a backslash
 * JSON doesn't allow (`\.`, `\d`, `\w`, as people paste regexes) is doubled, so it reaches the rule
 * as written. Pairs are read left to right, so an already doubled `\\.` stays as it is.
 */
function sanitizeJson(raw: string): string {
	return raw.replace(/"(?:[^"\\]|\\.)*"/gs, match => {
		return match
			.replace(/\r?\n/g, '\\n')
			.replace(/\t/g, '\\t')
			.replace(/\\([\s\S])/g, (pair, char: string) =>
				'"\\/bfnrtu'.includes(char) ? pair : `\\\\${char}`,
			)
	})
}

export function importRules(text: string): ImportResult {
	const rules: Rule[] = []
	const skipped: string[] = []
	const chunks = jsonChunks(text)
	if (!chunks.length)
		return {
			rules,
			skipped: [
				!text.trim()
					? 'The import box is empty. Paste the full rule JSON or use Import from clipboard.'
					: 'No JSON object found. Copy the full rule, starting with { and ending with }, not just its replacement text.',
			],
		}

	let index = 0
	for (const [block, chunk] of chunks.entries()) {
		let parsed: unknown
		try {
			parsed = JSON.parse(sanitizeJson(chunk))
		} catch {
			skipped.push(
				`Block ${block + 1}: invalid or incomplete JSON. Include the closing braces, use straight double quotes, and write line breaks inside strings as \\n.`,
			)
			continue
		}
		for (const raw of Array.isArray(parsed) ? parsed : [parsed]) {
			index++
			const result = toRule(raw, `Rule ${index}`)
			if (typeof result === 'string') skipped.push(result)
			else rules.push(result)
		}
	}
	return { rules, skipped }
}

export function ruleToJson(rule: Rule): Record<string, unknown> {
	return {
		name: rule.name ?? rule.find,
		match: rule.find,
		flags: `g${rule.caseSensitive ? '' : 'i'}${sanitizeFlags(rule.extraFlags)}`,
		replace: rule.replace,
		regex: rule.regex,
		...(rule.wholeWord !== undefined ? { wholeWord: rule.wholeWord } : {}),
		...(rule.live ? { live: true } : {}),
		...(rule.scope ? { scope: rule.scope } : {}),
	}
}

/** The same format back out, so a rule made here can be shared with Text Replace users. */
export function exportRule(rule: Rule): string {
	return JSON.stringify(ruleToJson(rule), null, 4)
}

/** Export all rules as a formatted JSON array. */
export function exportRules(rules: Rule[]): string {
	return JSON.stringify(rules.map(ruleToJson), null, 4)
}

/** The Vendetta server thread where Text Replace users share rules. The ready-made rules come from it. */
export const THREAD = {
	guildId: '1015931589865246730',
	channelId: '1094345290405920829',
	url: 'https://discord.com/channels/1015931589865246730/1094345290405920829',
}

export interface Preset {
	/** Which list it belongs in. */
	kind: 'links' | 'text'
	/**
	 * `thread`: as posted there. `updated`: from there, changed because the original no longer works
	 * or misses common links (the note says how). `added`: not from the thread.
	 */
	source: 'thread' | 'updated' | 'added'
	note: string
	rule: Omit<Rule, 'id' | 'enabled'>
}

/**
 * Checked on 2026-09-26 against the live services, requesting each with Discord's link-preview
 * user agent. Left out as dead: ddinstagram.com (no DNS), clips.txitch.tv (no DNS), vxtiktok.com
 * (shut down after a legal request), rxyddit.com (403; its domain now points at a personal site).
 * Changed: the thread's vxtwitter rule ends in `(?:(?:\?|&)(?:s|t)=\w+)*`, a repeat inside a repeat
 * that the freeze guard refuses; the tracking cleaner already removes ?s= and ?t=, so it was dropped.
 * Left out as not working: youtu.be to youtube.com (a link with ?t= becomes "watch?v=ID?t=42"),
 * http-ify (turns "Node.js" and "README.md" into links), Discord proxy to CDN (misses file names
 * with a dash). Left out as a personal preference: the heart replacer.
 *
 * Checked again on 2026-10-18, same way. Every rule above still embeds. Still dead: vxtiktok.com
 * (serves a "Notice" page), rxddit.com (502), ddinstagram.com (no DNS). Added from the defaults of
 * seriaati/embed-fixer, which tracks these services: tnktok.com (fxTikTok), bskx.app (VixBluesky),
 * phixiv.net and oginstagram.com. The first three were checked on real posts; OGInstagram answered
 * properly but wasn't tried on a real post. Left out: fixthreads and tpmblr (unclear on test links).
 */
export const PRESETS: Preset[] = [
	{
		kind: 'links',
		source: 'updated',
		note: 'Also catches www. and mobile. links. Pick this or vxtwitter, not both.',
		rule: {
			name: 'Twitter to fxtwitter',
			find: String.raw`https?:\/\/(?:www\.|mobile\.)?twitter\.com(?=\/\w+?\/status\/)`,
			replace: 'https://fxtwitter.com',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'updated',
		note: 'Another embed fixer for the same links; pick this or fxtwitter, not both. The original also stripped ?s= and ?t=, which Send Tweaks already removes.',
		rule: {
			name: 'Twitter to vxtwitter',
			find: String.raw`https?:\/\/(?:www\.|mobile\.)?twitter\.com(?=\/\w+?\/status\/)`,
			replace: 'https://vxtwitter.com',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'added',
		note: 'Not from the thread, which predates x.com links. Same service as fxtwitter.',
		rule: {
			name: 'X to fixupx',
			find: String.raw`https?:\/\/(?:www\.|mobile\.)?x\.com(?=\/\w+?\/status\/)`,
			replace: 'https://fixupx.com',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'updated',
		note: 'The thread used rxyddit.com, which has shut down. vxreddit.com embeds posts properly.',
		rule: {
			name: 'Reddit to vxreddit',
			find: String.raw`https?:\/\/(?:www\.|old\.|new\.)?reddit\.com(?=\/r\/\w+?\/comments\/)`,
			replace: 'https://vxreddit.com',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'updated',
		note: 'Also catches links without www. and usernames with dots or underscores, which the original missed.',
		rule: {
			name: 'TikTok to tiktxk',
			find: String.raw`https?:\/\/(?:(?:www\.|m\.)?tiktok\.com\/(@[\w.-]+\/video\/\d+|t\/\w+)|vm\.tiktok\.com\/(\w+))`,
			replace: 'https://tiktxk.com/$1$2',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'added',
		note: 'fxTikTok, the most used TikTok fixer in 2026. Pick this or tiktxk, not both.',
		rule: {
			name: 'TikTok to tnktok',
			find: String.raw`https?:\/\/(?:(?:www\.|m\.)?tiktok\.com\/(@[\w.-]+\/video\/\d+|t\/\w+)|vm\.tiktok\.com\/(\w+))`,
			replace: 'https://tnktok.com/$1$2',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'added',
		note: 'Posts and reels. Instagram previews in Discord often show nothing; this fills them in.',
		rule: {
			name: 'Instagram to oginstagram',
			find: String.raw`https?:\/\/(?:www\.)?instagram\.com(?=\/(?:p|reels?|tv)\/)`,
			replace: 'https://oginstagram.com',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'added',
		note: 'Bluesky posts with their pictures and videos.',
		rule: {
			name: 'Bluesky to bskx',
			find: String.raw`https?:\/\/(?:www\.)?bsky\.app(?=\/profile\/[\w.:-]+\/post\/)`,
			replace: 'https://bskx.app',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'added',
		note: 'pixiv artworks with the picture, including age-restricted ones.',
		rule: {
			name: 'pixiv to phixiv',
			find: String.raw`https?:\/\/(?:www\.)?pixiv\.net(?=(?:\/\w+)?\/artworks\/\d+)`,
			replace: 'https://phixiv.net',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'thread',
		note: 'Opens Shorts in the normal YouTube player.',
		rule: {
			name: 'YouTube Shorts to watch',
			find: 'youtube.com/shorts/',
			replace: 'youtube.com/watch?v=',
			regex: true,
			caseSensitive: true,
			wholeWord: false,
		},
	},
	{
		kind: 'text',
		source: 'thread',
		note: 'Anywhere in a message, not only at the start like Discord’s own /shrug.',
		rule: {
			name: '/shrug',
			find: '/shrug',
			replace: String.raw`¯\_(ツ)_/¯`,
			regex: false,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'text',
		source: 'thread',
		note: 'Escapes every markdown character in every message while it is on — switch it off to format again.',
		rule: {
			name: "Disable Discord's message markdown",
			find: '([`"*_<>~|#.-])',
			replace: String.raw`\$1`,
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'text',
		source: 'added',
		note: 'Turns `/rainbow <text>` into an ANSI rainbow codeblock of any length.',
		rule: {
			name: '/rainbow',
			find: String.raw`^\/rainbow\s+([\s\S]+)$`,
			replace: '{rainbow:$1}',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
]
