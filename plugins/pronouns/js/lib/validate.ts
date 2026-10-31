/**
 * "Only real pronouns": Discord's pronouns field is free text, so people put bios, ages, emoji,
 * jokes, names and links in it. With the setting on, a badge shows only the pronoun part of the
 * field (`he/him 🌈 | 19` → `he/him`), and nothing when there is none.
 *
 * Pronoun words come in families (every case form of one set: he/him/his/himself). Many words in
 * those families are also ordinary English words or parts of names: "her", "his", "one", "it",
 * "star", "cat", "Shi" (Emperor Shi Hao), "Ki", "Kit", "Fox". Those are AMBIGUOUS and only count
 * with clear evidence; the rest are DISTINCT ("they", "xe", "fae") and count on their own.
 *
 * A run of pronoun words is kept when:
 * - it's written with slashes (`she/her`, `cat/cats`) and has a distinct word or stays inside one
 *   family. `cat/dog`, `AC/DC` and `Star/Fox` don't pass.
 * - it's written without slashes (`they`, `he him`, `any`) and its part of the field holds nothing
 *   else, and it has a distinct word. A pronoun word inside a name or sentence never counts.
 *
 * Commas, pipes, bullets, line breaks, brackets and "but" split the field into parts first;
 * "and"/"or" join runs inside a part. A slash set with a he/she/they/it word also passes (`it/cat`).
 * PronounDB answers with codes, not free text, and goes through cleanPronounDb instead.
 */

/** Every case form of each pronoun set. Words in one family may form a set on their own. */
const FAMILIES: string[][] = [
	['he', 'him', 'his', 'himself'],
	['she', 'her', 'hers', 'herself'],
	['they', 'them', 'their', 'theirs', 'themself', 'themselves'],
	['it', 'its', 'itself'],
	['one', "one's", 'oneself'],
	['xe', 'xem', 'xyr', 'xyrs', 'xemself', 'xir', 'xirs', 'xirself', 'xey'],
	[
		'ze',
		'zir',
		'zirs',
		'zirself',
		'zie',
		'zim',
		'zem',
		'zes',
		'hir',
		'hirs',
		'hirself',
	],
	['fae', 'faer', 'faers', 'faerself'],
	['ey', 'em', 'eir', 'eirs', 'emself', 'e', 'ems'],
	['ve', 'ver', 'vis', 'verself', 'vir'],
	['ne', 'nem', 'nir', 'nirs', 'nemself', 'nym'],
	['per', 'pers', 'perself'],
	['thon', 'thons', 'thonself'],
	['ae', 'aer', 'aers', 'aerself'],
	['co', 'cos', 'coself'],
	['hu', 'hum', 'hus', 'huself'],
	['ki', 'kin', 'kis', 'kinself'],
	['sie', 'hir', 'hirs'],
	['shi', 'hir', 'hirs', 'hiz'],
	['star', 'stars', 'starself'],
	['bun', 'buns', 'bunself'],
	['vae', 'vaer', 'vaers', 'vaerself'],
	['mew', 'mews', 'mewself'],
	['pup', 'pups', 'pupself'],
	['nya', 'nyan', 'nyanself'],
	['void', 'voids', 'voidself'],
	['kit', 'kits', 'kitself'],
	['bee', 'bees', 'beeself'],
	['fox', 'foxes', 'foxself'],
	['cat', 'cats', 'catself'],
	['lu', 'lum', 'lus', 'luself'],
	['yo', 'yos', 'yoself'],
	['te', 'tem', 'ter', 'temself'],
	['di', 'dem', 'dir', 'demself'],
	['ya', 'yam', 'yamself'],
	['ix', 'ixs', 'ixself'],
]

/**
 * Pronoun words that are also everyday words, name parts or short syllables. They need a slash
 * and a distinct word or a family partner (`it/its`, `shi/hir`, `cat/cats`) to count.
 */
const AMBIGUOUS = new Set([
	'his',
	'her',
	'their',
	'it',
	'its',
	'one',
	"one's",
	'e',
	'em',
	'ems',
	'ey',
	've',
	'ver',
	'vis',
	'vir',
	'ne',
	'nym',
	'per',
	'pers',
	'thon',
	'thons',
	'ae',
	'co',
	'cos',
	'hu',
	'hum',
	'hus',
	'ki',
	'kin',
	'kis',
	'sie',
	'shi',
	'hiz',
	'zes',
	'zem',
	'zim',
	'star',
	'stars',
	'bun',
	'buns',
	'vae',
	'mew',
	'mews',
	'pup',
	'pups',
	'nya',
	'nyan',
	'void',
	'voids',
	'kit',
	'kits',
	'bee',
	'bees',
	'fox',
	'foxes',
	'cat',
	'cats',
	'lu',
	'lum',
	'lus',
	'yo',
	'yos',
	'te',
	'tem',
	'ter',
	'di',
	'dem',
	'dir',
	'ya',
	'yam',
	'ix',
	'ixs',
	'xir',
	'nir',
	'aer',
])

const ANY_ALL = ['any', 'all', 'anything', 'everything']

/** Words that may sit next to pronouns without making the part prose: "pronouns: she". */
const NEUTRAL = new Set(['pronouns', 'pronoun', 'prns', 'prn'])

/** Join two runs inside one part ("he and they") without making it prose. */
const CONNECTORS = new Set(['and', 'or'])

/** The standard families (he, she, they, it): enough to vouch for a slash set (`it/cat`). */
const STANDARD_FAMILIES = new Set([0, 1, 2, 3])

/** Backslashes and look-alike slashes people type instead of "/". */
const SLASHES = /[\\∕⁄／⧸]/g

/**
 * A field splits into parts at commas, pipes, bullets, line breaks, brackets and "but"; each part
 * is judged on its own, so `any (ask)` and `she/they (mostly she)` keep their pronouns.
 */
const PARTS = /[,|;•·+&\n()[\]{}<>]+|\s+but\s+/i

export interface ValidateOptions {
	/** Count "any"/"all" (and "any pronouns", "all pronouns") as valid. */
	anyAll: boolean
	/** Extra words the user allows, lowercase. They always count as distinct. */
	extra: string[]
}

/** The splitting rule: pronoun words are letters and apostrophes; everything else separates. */
const WORD = /[\p{L}']+/gu

const familyOf = new Map<string, Set<number>>()
FAMILIES.forEach((family, index) => {
	for (const word of family) {
		const set = familyOf.get(word) ?? new Set<number>()
		set.add(index)
		familyOf.set(word, set)
	}
})

interface Lexicon {
	known: Set<string>
	distinct: (word: string) => boolean
}

let cachedKey = ''
let cachedLexicon: Lexicon | undefined

function lexicon(options: ValidateOptions): Lexicon {
	const key = `${options.anyAll}|${options.extra.join(',')}`
	if (key !== cachedKey || !cachedLexicon) {
		const extra = new Set(options.extra)
		const known = new Set<string>([...familyOf.keys(), ...extra])
		if (options.anyAll) for (const word of ANY_ALL) known.add(word)
		cachedKey = key
		cachedLexicon = {
			known,
			distinct: word =>
				extra.has(word) || (known.has(word) && !AMBIGUOUS.has(word)),
		}
	}
	return cachedLexicon
}

/** Whether [word] is a he, she, they or it form. */
function standard(word: string): boolean {
	for (const index of familyOf.get(word) ?? [])
		if (STANDARD_FAMILIES.has(index)) return true
	return false
}

/** Whether every word of [words] is in one shared family. */
function oneFamily(words: string[]): boolean {
	let shared: Set<number> | undefined
	for (const word of words) {
		const families = familyOf.get(word)
		if (!families) return false
		shared = shared
			? new Set([...shared].filter(index => families.has(index)))
			: new Set(families)
		if (!shared.size) return false
	}
	return true
}

interface Run {
	/** As written ("He/Him" stays capitalised). */
	shown: string[]
	lower: string[]
	slashed: boolean
}

/**
 * The pronoun sets in [text], joined back with "/" and ", ", or undefined when there are none.
 * See the file comment for what counts.
 */
export function cleanPronouns(
	text: string,
	options: ValidateOptions,
): string | undefined {
	const { known, distinct } = lexicon(options)
	const sets: string[] = []
	for (const part of String(text ?? '')
		.replace(SLASHES, '/')
		.split(PARTS)) {
		const runs: Run[] = []
		let current: Run = { shown: [], lower: [], slashed: false }
		let prose = false
		let lastEnd = -1
		const flush = () => {
			if (current.shown.length) runs.push(current)
			current = { shown: [], lower: [], slashed: false }
		}
		for (const match of part.matchAll(WORD)) {
			const raw = match[0]
			const start = match.index ?? 0
			const between = lastEnd >= 0 ? part.slice(lastEnd, start) : ''
			lastEnd = start + raw.length
			const shown = raw.replace(/^'+|'+$/g, '')
			const word = shown.toLowerCase()
			if (!word) continue
			if (NEUTRAL.has(word)) continue
			// "he and they": two runs, still pronouns.
			if (CONNECTORS.has(word)) {
				flush()
				continue
			}
			// With any/all turned off they're dropped, not treated as prose: "he/any" keeps "he".
			if (!options.anyAll && ANY_ALL.includes(word)) continue
			if (!known.has(word)) {
				prose = true
				flush()
				continue
			}
			const joined = between.includes('/')
			// A new run starts at five words, or where a slash run meets a space ("she/her he/him").
			if (
				current.shown.length >= 5 ||
				(current.shown.length &&
					current.slashed !== joined &&
					current.shown.length > 1)
			)
				flush()
			if (joined && current.shown.length) current.slashed = true
			current.shown.push(shown)
			current.lower.push(word)
		}
		flush()
		for (const run of runs) {
			const hasDistinct = run.lower.some(distinct)
			const keep = run.slashed
				? hasDistinct || oneFamily(run.lower) || run.lower.some(standard)
				: !prose && hasDistinct
			if (keep) sets.push(run.shown.join('/'))
		}
	}
	const seen = new Set<string>()
	const unique = sets.filter(
		set => !seen.has(set.toLowerCase()) && seen.add(set.toLowerCase()),
	)
	return unique.length ? unique.join(', ') : undefined
}

/**
 * Characters that draw as blank space: whitespace, the Hangul fillers (`ㅤ`, U+3164, is the usual
 * "invisible name" character), the blank Braille cell and the Khmer inherent vowels.
 */
const BLANK = '\\s\\u115F\\u1160\\u17B4\\u17B5\\u2800\\u3164\\uFFA0'

/**
 * Zero-width format characters: soft hyphen, zero-width space and non-joiner, direction marks
 * and overrides, word joiner, invisible operators, BOM. The zero-width joiner and the variation
 * selectors aren't here, because emoji are built from them (🏳️‍🌈, ❤️).
 */
const ZERO =
	'\\u00AD\\u034F\\u061C\\u180E\\u200B\\u200C\\u200E\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u206F\\uFEFF'

const BLANK_RUN = new RegExp(`[${ZERO}]*[${BLANK}][${BLANK}${ZERO}]*`, 'gu')
const EDGES = new RegExp(`^[ ${ZERO}]+|[ ${ZERO}]+$`, 'gu')
/** What's left once emoji glue is removed too: nothing means the text only looked like something. */
const GLUE = new RegExp(`[${ZERO}\\u200D\\uFE00-\\uFE0F]`, 'gu')

/**
 * [text] without visually empty space: trimmed at both ends, and every blank run inside it
 * (`he/him   ㅤㅤ  she`) shortened to one space. Undefined when nothing visible is left, so a
 * field of spaces or invisible characters never draws an empty badge.
 */
export function tidy(text: unknown): string | undefined {
	if (typeof text !== 'string') return undefined
	const tidied = text.replace(BLANK_RUN, ' ').replace(EDGES, '')
	return tidied.replace(GLUE, '') ? tidied : undefined
}

/** PronounDB codes that aren't pronouns. */
const PRONOUNDB_NOT_PRONOUNS = new Set(['ask', 'avoid', 'other'])

/**
 * PronounDB's answer (its `sets.en` codes joined with "/", like `he/it`). Structured, so the
 * name and prose checks don't apply; only "ask", "avoid" and "other" are dropped, and any/all
 * follow the setting.
 */
export function cleanPronounDb(
	text: string,
	options: ValidateOptions,
): string | undefined {
	const kept = String(text ?? '')
		.split('/')
		.map(code => code.trim())
		.filter(code => code && !PRONOUNDB_NOT_PRONOUNS.has(code.toLowerCase()))
		.filter(code => options.anyAll || !ANY_ALL.includes(code.toLowerCase()))
	return kept.length ? kept.join('/') : undefined
}

/** Normalises the "also allow" text field into a word list. */
export function parseExtra(text: string): string[] {
	return [
		...new Set(
			(text.toLowerCase().match(WORD) ?? [])
				.map(word => word.replace(/^'+|'+$/g, ''))
				.filter(Boolean),
		),
	]
}
