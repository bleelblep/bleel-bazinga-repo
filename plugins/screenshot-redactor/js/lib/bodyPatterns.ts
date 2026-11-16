/**
 * Details people type into messages, found by pattern alone.
 *
 * Everything this plugin redacted until now was an *identity field* — the author's name, their
 * avatar, a mention, a badge. None of that touches what people actually wrote, so a screenshot
 * with every name replaced still happily showed "call me on 021 555 1234" or the email address
 * somebody pasted three messages up.
 *
 * This is the free half of fixing that: no key, no network, no AI, running on every row. It is
 * deliberately the same two-tier shape as Second Thoughts — patterns for what patterns can
 * settle, a model only for what they cannot — and the precision lessons are carried over intact:
 * Luhn for card numbers, a snowflake exclusion so Discord ids are not mistaken for phone numbers,
 * and a counting-noun stoplist so "2 hours drive home" is not an address.
 *
 * Precision matters more here than in a send-guard. A false positive in Second Thoughts costs a
 * confirmation tap; a false positive here silently blacks out part of a message in a screenshot
 * the user is about to post, and they may not notice what went missing.
 */

export type SensitiveKind =
	| 'email'
	| 'phone'
	| 'address'
	| 'card'
	| 'credential'
	| 'invite'
	| 'url'

export interface Sensitive {
	/** The literal text to blank out. Matched as a substring, so every occurrence goes. */
	value: string
	kind: SensitiveKind
}

/** Discord snowflakes are 17-20 digits and are all over normal conversation. */
const SNOWFLAKE = /^\d{17,20}$/

const SIMPLE: Array<[RegExp, SensitiveKind]> = [
	[/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, 'email'],
	[/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'credential'],
	[/\bsk-ant-[A-Za-z0-9_-]{20,}/g, 'credential'],
	[/\bsk-(proj-)?[A-Za-z0-9_-]{20,}/g, 'credential'],
	[/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, 'credential'],
	[/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, 'credential'],
	[/\bAKIA[0-9A-Z]{16}\b/g, 'credential'],
	[/\bAIza[0-9A-Za-z_-]{35}\b/g, 'credential'],
	[
		/\b[MNO][A-Za-z\d_-]{23,27}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}\b/g,
		'credential',
	],
	[
		/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
		'credential',
	],
	[/\b(?:discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+/g, 'invite'],
	// Same shape as Second Thoughts' address pattern, including the stoplist and the two street
	// types that had to be dropped for colliding with ordinary English.
	[
		/\b\d{1,5}[a-z]?\s+(?!(?:hours?|hrs?|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|years?|times?|people|players|kills|deaths|items|games|rounds|points|dollars|bucks|more|other|out|of)\b)([a-z'-]+\s+){1,2}(street|st|road|rd|avenue|ave|drive|crescent|cres|terrace|tce|boulevard|blvd|highway|hwy|parade|pde|quay)\b/gi,
		'address',
	],
]

const PHONE =
	/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]?\d{3,4}\b/g
const CARDISH = /\b(?:\d[ -]?){13,19}\b/g

function luhn(digits: string): boolean {
	let sum = 0
	let double = false
	for (let i = digits.length - 1; i >= 0; i--) {
		let value = digits.charCodeAt(i) - 48
		if (double) {
			value *= 2
			if (value > 9) value -= 9
		}
		sum += value
		double = !double
	}
	// Only an all-zero run (sum 0) is ruled out. Through 0.27.15 this said `sum % 100 === 0`, which
	// also threw out every real card whose total is exactly 100 -- about 1 in 30 -- and left it shown.
	return sum > 0 && sum % 10 === 0
}

/**
 * Every sensitive-looking run in one message's text.
 *
 * Returned longest first, so applying them in order cannot leave a shorter match half-redacted
 * inside a longer one — a phone number inside an address, for instance.
 */
export function findSensitive(text: string): Sensitive[] {
	if (typeof text !== 'string' || !text) return []

	const found: Sensitive[] = []
	const seen = new Set<string>()

	const add = (value: string, kind: SensitiveKind) => {
		const trimmed = value.trim()
		if (trimmed.length < 4 || seen.has(trimmed)) return
		seen.add(trimmed)
		found.push({ value: trimmed, kind })
	}

	for (const [pattern, kind] of SIMPLE) {
		pattern.lastIndex = 0
		for (const match of text.match(pattern) ?? []) add(match, kind)
	}

	CARDISH.lastIndex = 0
	for (const match of text.match(CARDISH) ?? []) {
		const digits = match.replace(/\D/g, '')
		if (digits.length < 13 || digits.length > 19) continue
		// A snowflake that happens to pass Luhn is far likelier than a card in a chat message.
		if (SNOWFLAKE.test(digits)) continue
		if (luhn(digits)) add(match, 'card')
	}

	PHONE.lastIndex = 0
	for (const match of text.match(PHONE) ?? []) {
		const digits = match.replace(/\D/g, '')
		if (digits.length < 8 || digits.length > 15) continue
		if (SNOWFLAKE.test(digits)) continue
		add(match, 'phone')
	}

	return found.sort((a, b) => b.value.length - a.value.length)
}
