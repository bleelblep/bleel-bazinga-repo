import type { Rule } from './lib/textReplace'

export type { Rule }

/**
 * The slice of AI Core's decorated api this plugin uses. Declared locally: plugins are separate
 * bundles, so `api.ai` only exists at runtime and cannot be imported. Undefined when AI Core is not
 * installed -- AI Core is an optional dependency, and everything AI-related is hidden without it.
 */
export interface AiHandle {
	isAvailable(): boolean
	/** Plain text back. Present on every AI Core that has `json`; optional so an old one is caught. */
	text?(request: {
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
		temperature?: number
		maxTokens?: number
		timeoutMs?: number
	}): Promise<string | undefined>
	json<T = unknown>(request: {
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
		temperature?: number
		maxTokens?: number
		timeoutMs?: number
	}): Promise<T | undefined>
	budget(): {
		configured: boolean
		used: number
		cap: number
		remaining: number
		unlimited?: boolean
	}
	setSettingsRoute?(route: string): void
}

/** One ClearURLs provider, as stored: regex sources, compiled when used. */
export interface ClearUrlsProvider {
	/** Matched against the whole URL to decide whether the provider applies. */
	pattern: string
	/** Parameter names, each a regex matched against the whole name. */
	rules: string[]
	/** Whole-URL regexes; a match means the provider leaves the URL alone. */
	exceptions: string[]
	/** Whole-URL regexes whose first group is the real destination of a redirect link. */
	redirections: string[]
}

export interface ClearUrlsData {
	/** When it was downloaded (ms since epoch). */
	updatedAt: number
	providers: ClearUrlsProvider[]
}

/** Someone on the "Don't ping when replying" list. The name is only for showing the list. */
export interface ReplyPerson {
	id: string
	name: string
}

export interface SendTweaksStorage {
	/** Strip tracking parameters from links before a message goes out. */
	cleanUrls: boolean
	/** Also use the ClearURLs community rules (downloaded, refreshed weekly) on top of the built-in list. */
	clearUrlsRules: boolean
	/**
	 * The last ClearURLs rules downloaded, trimmed to what link cleaning uses. Null until the first
	 * download. Replaced whole on each update (an object, but every field is rewritten together).
	 */
	clearUrlsData: ClearUrlsData | null
	/** Start every reply with the mention switched off. Discord's own @ toggle still works. */
	noReplyMention: boolean
	/** `except`: no reply pings except to `replyPingPeople`. `only`: reply pings except to them. */
	replyPingMode?: 'except' | 'only'
	/** Stored whole, like `rules`, so removing someone sticks. */
	replyPingPeople?: ReplyPerson[]
	/** Run your find-and-replace rules on outgoing messages. */
	textReplace: boolean
	/**
	 * Stored as an array and always written whole. `jsonStorage.set()` deep-merges objects but
	 * *replaces* arrays (`isObject` in revenge-bundle-next's `lib/utils/src/object.ts` excludes
	 * them), so deleting a rule sticks -- unlike a keyed object, where coding rule 6 applies.
	 */
	rules: Rule[]
	/** Run your link rules (e.g. twitter.com -> fxtwitter.com) inside links. */
	linkRewrite: boolean
	/** Rules applied only inside links. Stored whole, like `rules`. */
	linkRules: Rule[]
	/**
	 * Send every new message as Discord's @silent: it arrives, but nobody gets a push or desktop
	 * notification for it. Edits are never affected -- a message's flags are fixed once sent.
	 */
	silentMessages: boolean
	/**
	 * Hold send and swipe up to preview the message first. With Send unchanged also on, preview is the
	 * halfway stop; alone, it is the top.
	 */
	swipePreview: boolean
	/**
	 * Hold send and swipe up to the top to send exactly as typed: no link cleaning, rules or @silent.
	 * With both swipe switches off, holding send does nothing.
	 */
	swipeSendUnchanged: boolean
	/**
	 * Tapping send opens the preview instead of sending; Send in the preview sends. For anyone who
	 * can't do the hold-and-swipe. Optional: older storage has no value, which reads as off.
	 */
	tapToPreview?: boolean
	/** Also apply link cleaning and text replacement when you edit a message. */
	applyToEdits: boolean
	debugLogging: boolean
	/** Greeting placeholders in text rules, unlocked with a phrase. See lib/greetings.ts. */
	greetingsUnlocked?: boolean
	/** Welcome Wagon: your own placeholders with a default value. See lib/wagon.ts. Stored whole. */
	wagonPlaceholders?: import('./lib/wagon').WagonPlaceholder[]
	/** Welcome Wagon per-server settings: on/off and placeholder values. Stored whole. */
	wagonServers?: import('./lib/wagon').WagonServer[]
	/** Arrays replace atomically so deleting a snippet persists. */
	snippets?: import('./lib/templateSyntax').Snippet[]
	dateFormat?: string
	timeFormat?: string
	/** Polish wording (lib/polish.ts): tidy up the words of every message, on the phone. */
	polishWording?: boolean
	/** dont -> don't, im -> I'm. */
	polishApostrophes?: boolean
	/** Capital at the start of each sentence, and "i" on its own. */
	polishCapitals?: boolean
	/** A full stop at the end when the message ends in a word. */
	polishFullStop?: boolean
	/** Comma-separated words never capitalised at the start of a sentence, like "lol, brb". */
	polishSkip?: string
}
