/**
 * Polish wording: small tidy-ups to the words of a message, done on the phone with no AI.
 *
 * - Apostrophes: "dont" becomes "don't", "im" becomes "I'm".
 * - Capitals: the first letter of each sentence, and "i" on its own.
 * - Full stop: one at the end of the message, when it ends in a letter or number.
 *
 * The idea comes from Equicord's PolishWording; this is written for Send Tweaks and shares no
 * code with it. Unlike that plugin it leaves out contractions that are also ordinary words --
 * "ill", "wed", "shed", "its", "were", "well", "hell", "lets" -- because a wrong fix there changes
 * what was said.
 *
 * Runs from `transform` with links, mentions, emoji, timestamps and code held aside as
 * placeholders, so none of them can be capitalised or punctuated. No lookbehind or `\p{}`: neither is proven on Hermes.
 */

export interface PolishOptions {
	apostrophes: boolean
	capitals: boolean
	fullStop: boolean
	/** Lower-case words never capitalised at the start of a sentence. */
	skip: string[]
}

/** Without the apostrophe -> with it. Only words that are never anything else in chat. */
const CONTRACTIONS: Record<string, string> = {
	dont: "don't",
	cant: "can't",
	wont: "won't",
	isnt: "isn't",
	arent: "aren't",
	wasnt: "wasn't",
	werent: "weren't",
	hasnt: "hasn't",
	havent: "haven't",
	hadnt: "hadn't",
	doesnt: "doesn't",
	didnt: "didn't",
	shouldnt: "shouldn't",
	wouldnt: "wouldn't",
	couldnt: "couldn't",
	mustnt: "mustn't",
	neednt: "needn't",
	aint: "ain't",
	shouldve: "should've",
	wouldve: "would've",
	couldve: "could've",
	im: "I'm",
	ive: "I've",
	youre: "you're",
	youve: "you've",
	youll: "you'll",
	youd: "you'd",
	theyre: "they're",
	theyve: "they've",
	theyll: "they'll",
	theyd: "they'd",
	weve: "we've",
	thats: "that's",
	whats: "what's",
	wheres: "where's",
	whos: "who's",
	hows: "how's",
	theres: "there's",
	heres: "here's",
	itll: "it'll",
	hes: "he's",
	shes: "she's",
	yall: "y'all",
}

const CONTRACTION = new RegExp(
	`\\b(${Object.keys(CONTRACTIONS).join('|')})\\b`,
	'gi',
)

/** Keeps the shouting: DONT -> DON'T, Dont -> Don't, dont -> don't. "I" forms stay capital. */
function matchCase(typed: string, fixed: string): string {
	if (typed.length > 1 && typed === typed.toUpperCase())
		return fixed.toUpperCase()
	if (typed[0] === typed[0].toUpperCase())
		return fixed[0].toUpperCase() + fixed.slice(1)
	return fixed
}

export function fixApostrophes(text: string): string {
	return text.replace(CONTRACTION, typed =>
		matchCase(typed, CONTRACTIONS[typed.toLowerCase()]),
	)
}

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATIONS = new Set([
	'e.g',
	'i.e',
	'etc',
	'vs',
	'mr',
	'mrs',
	'ms',
	'dr',
	'st',
	'approx',
])

/**
 * Latin, Greek and Cyrillic letters. Spelled out rather than `\p{L}`: Unicode property escapes
 * are not proven on Hermes, and a regex it rejects would throw at module load.
 */
const L = 'A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF'
const LETTER = new RegExp(`[${L}]`)
const WORD_AT = new RegExp(`^[${L}0-9'’-]+`)
const WORD_BEFORE = new RegExp(`[${L}.]+$`)
const I_ALONE = new RegExp(
	`(^|[^${L}0-9_'’.-])i(?=$|[\\s,!?;:)"”]|['’](?:m|ll|d|ve)\\b|\\.(?:\\s|$))`,
	'g',
)
const ENDS_IN_WORD = new RegExp(`[${L}0-9]$`)

/**
 * Capitalises the first letter of each sentence: the start of the message, after a line break,
 * and after . ! or ? followed by a space. Not after "..." (a trailing-off, not an ending) or an
 * abbreviation like "e.g.". A word that already has a capital in it (iPhone, eBay) or is on the
 * skip list is left as typed. Anything other than a letter at a sentence start -- a mention, an
 * emoji, a quote mark -- means that sentence is left alone.
 */
export function capitaliseSentences(text: string, skip: string[] = []): string {
	const skipped = new Set(skip.map(word => word.toLowerCase()))
	let out = ''
	let start = true
	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		if (start && LETTER.test(char)) {
			const word = WORD_AT.exec(text.slice(i))?.[0] ?? char
			const keep =
				word !== word.toLowerCase() || skipped.has(word.toLowerCase())
			out += keep ? char : char.toUpperCase()
			start = false
			continue
		}
		out += char
		if (char === '\n') {
			start = true
		} else if (/\s/.test(char)) {
			// Whitespace keeps whatever state the sentence end set.
		} else if (
			(char === '.' || char === '!' || char === '?') &&
			/\s/.test(text[i + 1] ?? '')
		) {
			start = !(char === '.' && endsWithoutEnding(text, i))
		} else if (start && /["'“‘(*_~>]/.test(char)) {
			// Opening quotes, brackets and markdown marks: the sentence starts after them.
		} else {
			start = false
		}
	}
	return out
}

/** Whether the "." at [dot] is part of "..." or an abbreviation rather than a sentence end. */
function endsWithoutEnding(text: string, dot: number): boolean {
	if (text[dot - 1] === '.' || text[dot - 1] === '…') return true
	const before = WORD_BEFORE.exec(text.slice(0, dot))?.[0]?.toLowerCase()
	return !!before && ABBREVIATIONS.has(before)
}

/** "i" on its own, and in i'm, i'll, i'd, i've. Not the i in "i.e.". */
export function capitaliseI(text: string): string {
	return text.replace(I_ALONE, '$1I')
}

/** A full stop at the very end, when the message ends in a letter or number. */
export function addFullStop(text: string): string {
	const trimmed = text.replace(/\s+$/, '')
	if (!ENDS_IN_WORD.test(trimmed)) return text
	return `${trimmed}.${text.slice(trimmed.length)}`
}

export function polish(text: string, options: PolishOptions): string {
	let out = text
	if (options.apostrophes) out = fixApostrophes(out)
	if (options.capitals)
		out = capitaliseSentences(capitaliseI(out), options.skip)
	if (options.fullStop) out = addFullStop(out)
	return out
}

/** "lol, brb" -> ["lol", "brb"]. */
export function parseSkipList(value: string | undefined): string[] {
	return (value ?? '')
		.split(/[,\s]+/)
		.map(word => word.trim().toLowerCase())
		.filter(Boolean)
}
