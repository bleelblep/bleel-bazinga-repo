import { COUNTRY_NAMES, ZONE_LINKS, ZONE_TAB } from './zoneData'

/**
 * Timezone maths: what time it is (or was) for someone in a given zone.
 *
 * A zone is either an IANA name ("Europe/London") or a fixed offset ("+05:30"), as in the Aliucord
 * original, so the shared timezone lookup's answers work as they come. IANA zones go through
 * `Intl.DateTimeFormat` (Hermes on Android backs it with ICU); fixed offsets are plain arithmetic, so
 * they keep working if Intl ever can't do zones.
 *
 * Nothing here throws: a zone that can't be read formats as undefined.
 */

/** The picker's starting list. Anything else Intl accepts can be typed in. */
export const ZONES = [
	'Pacific/Honolulu',
	'America/Anchorage',
	'America/Los_Angeles',
	'America/Vancouver',
	'America/Tijuana',
	'America/Phoenix',
	'America/Denver',
	'America/Edmonton',
	'America/Chicago',
	'America/Mexico_City',
	'America/Winnipeg',
	'America/New_York',
	'America/Toronto',
	'America/Detroit',
	'America/Panama',
	'America/Bogota',
	'America/Lima',
	'America/Caracas',
	'America/Halifax',
	'America/Puerto_Rico',
	'America/Santiago',
	'America/St_Johns',
	'America/Sao_Paulo',
	'America/Recife',
	'America/Argentina/Buenos_Aires',
	'America/Montevideo',
	'Atlantic/Azores',
	'Atlantic/Reykjavik',
	'Europe/London',
	'Europe/Dublin',
	'Europe/Lisbon',
	'Africa/Casablanca',
	'Africa/Lagos',
	'Europe/Paris',
	'Europe/Brussels',
	'Europe/Amsterdam',
	'Europe/Berlin',
	'Europe/Zurich',
	'Europe/Vienna',
	'Europe/Rome',
	'Europe/Madrid',
	'Europe/Stockholm',
	'Europe/Oslo',
	'Europe/Copenhagen',
	'Europe/Prague',
	'Europe/Warsaw',
	'Europe/Budapest',
	'Europe/Belgrade',
	'Africa/Johannesburg',
	'Africa/Cairo',
	'Europe/Athens',
	'Europe/Bucharest',
	'Europe/Helsinki',
	'Europe/Kyiv',
	'Asia/Jerusalem',
	'Europe/Istanbul',
	'Europe/Moscow',
	'Africa/Nairobi',
	'Asia/Riyadh',
	'Asia/Baghdad',
	'Asia/Tehran',
	'Asia/Dubai',
	'Asia/Baku',
	'Asia/Kabul',
	'Asia/Karachi',
	'Asia/Tashkent',
	'Asia/Kolkata',
	'Asia/Colombo',
	'Asia/Kathmandu',
	'Asia/Dhaka',
	'Asia/Almaty',
	'Asia/Yangon',
	'Asia/Bangkok',
	'Asia/Ho_Chi_Minh',
	'Asia/Jakarta',
	'Asia/Singapore',
	'Asia/Kuala_Lumpur',
	'Asia/Manila',
	'Asia/Shanghai',
	'Asia/Hong_Kong',
	'Asia/Taipei',
	'Australia/Perth',
	'Asia/Seoul',
	'Asia/Tokyo',
	'Australia/Darwin',
	'Australia/Adelaide',
	'Australia/Brisbane',
	'Australia/Sydney',
	'Australia/Melbourne',
	'Australia/Hobart',
	'Pacific/Guam',
	'Pacific/Noumea',
	'Pacific/Auckland',
	'Pacific/Fiji',
	'Pacific/Tongatapu',
	'Pacific/Kiritimati',
	'UTC',
]

/** Fixed offsets, also from the original. */
export const OFFSETS = [
	'-12:00', '-11:00', '-10:00', '-09:30', '-09:00', '-08:00', '-07:00', '-06:00', '-05:00', '-04:00',
	'-03:30', '-03:00', '-02:00', '-01:00', '+00:00', '+01:00', '+02:00', '+03:00', '+03:30', '+04:00',
	'+04:30', '+05:00', '+05:30', '+05:45', '+06:00', '+06:30', '+07:00', '+08:00', '+08:45', '+09:00',
	'+09:30', '+10:00', '+10:30', '+11:00', '+12:00', '+12:45', '+13:00', '+14:00',
]

const OFFSET_RE = /^(?:UTC|GMT)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i

/** "+5", "UTC+5:30", "gmt-0930" → "+05:00" / "+05:30" / "-09:30"; anything else → undefined. */
export function normalizeOffset(text: string): string | undefined {
	const match = OFFSET_RE.exec(text.trim())
	if (!match) return undefined
	const hours = Number(match[2])
	const minutes = Number(match[3] ?? 0)
	if (hours > 14 || minutes > 59) return undefined
	return `${match[1]}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function offsetMinutes(offset: string): number | undefined {
	const normal = normalizeOffset(offset)
	if (!normal) return undefined
	const sign = normal[0] === '-' ? -1 : 1
	return sign * (Number(normal.slice(1, 3)) * 60 + Number(normal.slice(4, 6)))
}

// One formatter per zone: building them is the slow part.
const formatters = new Map<string, Intl.DateTimeFormat | null>()

function formatterFor(zone: string): Intl.DateTimeFormat | undefined {
	if (formatters.has(zone)) return formatters.get(zone) ?? undefined
	let formatter: Intl.DateTimeFormat | null = null
	try {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
		})
	} catch {
		/* RangeError: not a zone this engine knows */
	}
	formatters.set(zone, formatter)
	return formatter ?? undefined
}

/**
 * The zone's UTC offset at [at], in minutes, or undefined when the zone can't be read. Read off a
 * formatted "MM/DD/YYYY, HH:mm" rather than formatToParts, which older Hermes builds lack.
 */
export function zoneOffset(zone: string, at: number): number | undefined {
	const fixed = offsetMinutes(zone)
	if (fixed !== undefined) return fixed
	const formatter = formatterFor(zone)
	if (!formatter) return undefined
	try {
		const digits = formatter.format(new Date(at)).match(/\d+/g)
		if (!digits || digits.length < 5) return undefined
		const [month, day, year, hour, minute] = digits.map(Number)
		// Some engines print midnight as 24 with hour12: false.
		const wall = Date.UTC(year, month - 1, day, hour % 24, minute)
		const utcMinute = Math.floor(at / 60_000) * 60_000
		return Math.round((wall - utcMinute) / 60_000)
	} catch {
		return undefined
	}
}

let intlChecked: boolean | undefined

/**
 * Whether Intl really honours `timeZone` here. An engine that ignores it formats every zone as the
 * phone's own time, which would show wrong times rather than none.
 */
export function intlZonesWork(): boolean {
	if (intlChecked !== undefined) return intlChecked
	const now = Date.now()
	// An engine ignoring timeZone gives both the phone's own offset, which can't be +9 and 0 at once.
	intlChecked = zoneOffset('Asia/Tokyo', now) === 540 && zoneOffset('UTC', now) === 0
	return intlChecked
}

/** Whether [zone] can be shown: a fixed offset, or an IANA name Intl knows. */
export function isValidZone(zone: string): boolean {
	if (offsetMinutes(zone) !== undefined) return true
	return intlZonesWork() && zoneOffset(zone, Date.now()) !== undefined
}

/** "UTC+5:30", "UTC−3", "UTC". */
export function offsetLabel(minutes: number): string {
	if (minutes === 0) return 'UTC'
	const sign = minutes < 0 ? '−' : '+'
	const abs = Math.abs(minutes)
	const rest = abs % 60
	return `UTC${sign}${Math.floor(abs / 60)}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function clock(hours: number, minutes: number, hour24: boolean): string {
	const mm = String(minutes).padStart(2, '0')
	if (hour24) return `${String(hours).padStart(2, '0')}:${mm}`
	return `${hours % 12 || 12}:${mm} ${hours >= 12 ? 'PM' : 'AM'}`
}

export interface ZoneTime {
	/** "3:02 AM" or "03:02". */
	time: string
	/** Their weekday when it differs from yours at the same moment ("Tue"), else undefined. */
	otherDay?: string
	/** Their offset, e.g. "UTC+1". */
	offset: string
}

/** What the clock said in [zone] at [at] (ms), or undefined when the zone can't be read. */
export function timeIn(zone: string, at: number, hour24: boolean): ZoneTime | undefined {
	if (!Number.isFinite(at)) return undefined
	const isFixed = offsetMinutes(zone) !== undefined
	if (!isFixed && !intlZonesWork()) return undefined
	const offset = zoneOffset(zone, at)
	if (offset === undefined) return undefined
	const theirs = new Date(at + offset * 60_000)
	const yours = new Date(at)
	const theirDay = theirs.getUTCDay()
	return {
		time: clock(theirs.getUTCHours(), theirs.getUTCMinutes(), hour24),
		otherDay: theirDay === yours.getDay() ? undefined : WEEKDAYS[theirDay],
		offset: offsetLabel(offset),
	}
}

/** "London", "Buenos Aires", "UTC+5:30" — the short name for a zone in rows and sheets. */
export function zoneName(zone: string): string {
	const fixed = offsetMinutes(zone)
	if (fixed !== undefined) return offsetLabel(fixed)
	const city = zone.split('/').pop() ?? zone
	return city.replace(/_/g, ' ')
}

/** Accepts the stored value from the shared lookup or the picker; undefined when unusable. */
export function cleanZone(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const text = value.trim()
	if (!text) return undefined
	return normalizeOffset(text) ?? text
}

// ---- Search -------------------------------------------------------------------------------------

/** One row in the picker. */
export interface ZoneMatch {
	zone: string
	/** What the row is called: a country, a city or an offset. */
	title: string
	/** The line under it: country, region note, or where an online place is. */
	detail?: string
	/** Saved with the person and shown instead of the zone's city, e.g. "Kenya" or "Mombasa, Kenya". */
	place?: string
}

/** Everyday names tz doesn't use ("Britain (UK)", "Korea (South)"…). */
const COUNTRY_ALIASES: Record<string, string> = {
	usa: 'US', us: 'US', america: 'US', 'united states of america': 'US',
	uk: 'GB', 'united kingdom': 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB',
	wales: 'GB', 'northern ireland': 'GB',
	uae: 'AE', emirates: 'AE', 'united arab emirates': 'AE',
	'south korea': 'KR', korea: 'KR', 'north korea': 'KP',
	holland: 'NL', czechia: 'CZ', turkiye: 'TR', burma: 'MM', 'ivory coast': 'CI', drc: 'CD',
	'democratic republic of the congo': 'CD', 'republic of the congo': 'CG', swaziland: 'SZ',
	macao: 'MO', 'cape verde': 'CV', 'east timor': 'TL', palestine: 'PS', vatican: 'VA',
	'american samoa': 'AS', 'samoa': 'WS', 'bosnia': 'BA', 'trinidad': 'TT',
}

// U+0300 to U+036F, the accents NFD splits off.
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g')

/** Lower case, accents off ("Curaçao" → "curacao"), underscores and punctuation to spaces. */
function fold(text: string): string {
	let out = text.toLowerCase()
	try {
		out = out.normalize('NFD').replace(COMBINING_MARKS, '')
	} catch {
		/* no normalize on this engine: accents stay */
	}
	return out.replace(/[_\-/().,'&]+/g, ' ').replace(/\s+/g, ' ').trim()
}

interface Indexed {
	zone: string
	cc: string
	country: string
	city: string
	note: string
	/** Folded: city, whole zone path, note. */
	cityKey: string
	pathKey: string
	noteKey: string
}

let index: { zones: Indexed[]; byCountry: Map<string, Indexed[]>; links: Array<[string, string, string]> } | undefined

function getIndex() {
	if (index) return index
	const zones: Indexed[] = []
	const byCountry = new Map<string, Indexed[]>()
	for (const line of ZONE_TAB.split('\n')) {
		const [cc, zone, note = ''] = line.split('|')
		if (!zone) continue
		const city = zoneName(zone)
		const entry: Indexed = {
			zone,
			cc,
			country: COUNTRY_NAMES[cc] ?? cc,
			city,
			note,
			cityKey: fold(city),
			pathKey: fold(zone),
			noteKey: fold(note),
		}
		zones.push(entry)
		const list = byCountry.get(cc) ?? []
		list.push(entry)
		byCountry.set(cc, list)
	}
	const links: Array<[string, string, string]> = []
	for (const line of ZONE_LINKS.split('\n')) {
		const [old, current] = line.split('|')
		if (old && current) links.push([fold(old), old, current])
	}
	index = { zones, byCountry, links }
	return index
}

/** Country codes whose name (or an everyday alias) starts with or contains [q]. Best first. */
function matchCountries(q: string): string[] {
	const starts: string[] = []
	const contains: string[] = []
	const alias = COUNTRY_ALIASES[q]
	if (alias) starts.push(alias)
	for (const [name, cc] of Object.entries(COUNTRY_ALIASES)) {
		if (name !== q && name.startsWith(q) && q.length >= 3 && !starts.includes(cc)) starts.push(cc)
	}
	for (const cc of Object.keys(COUNTRY_NAMES)) {
		const name = fold(COUNTRY_NAMES[cc])
		if (starts.includes(cc)) continue
		if (name === q || name.startsWith(q)) starts.push(cc)
		else if (q.length >= 3 && name.includes(q)) contains.push(cc)
	}
	return [...starts, ...contains]
}

function cityMatch(entry: Indexed): ZoneMatch {
	return {
		zone: entry.zone,
		title: entry.city,
		detail: entry.note ? `${entry.country} · ${entry.note}` : entry.country,
		place: `${entry.city}, ${entry.country}`,
	}
}

function countryMatches(cc: string): ZoneMatch[] {
	const country = COUNTRY_NAMES[cc] ?? cc
	const zones = getIndex().byCountry.get(cc) ?? []
	if (zones.length === 1) return [{ zone: zones[0].zone, title: country, detail: zones[0].city, place: country }]
	return zones.map(entry => ({
		zone: entry.zone,
		title: `${country} — ${entry.city}`,
		detail: entry.note || undefined,
		place: `${entry.city}, ${country}`,
	}))
}

function fromZone(zone: string): ZoneMatch {
	const fixed = offsetMinutes(zone)
	if (fixed !== undefined) return { zone, title: offsetLabel(fixed), detail: 'Fixed offset, no daylight saving' }
	const entry = getIndex().zones.find(z => z.zone === zone)
	return entry ? cityMatch(entry) : { zone, title: zoneName(zone) }
}

/**
 * Picker search, all offline: countries ("Kenya", "UK", "New Zealand") give their zones; then every
 * IANA zone by city, path or tz's region note ("Indiana", "Mountain"); old names ("Calcutta");
 * a full zone typed in; offsets. Places that aren't a zone city come from [searchPlaces] online.
 */
export function searchZones(query: string, limit = 60): ZoneMatch[] {
	const q = fold(query)
	if (!q) return ZONES.map(fromZone).slice(0, limit)
	const { zones, links } = getIndex()
	const out: ZoneMatch[] = []
	const seen = new Set<string>()
	// One row per zone: the first (best) way it matched wins.
	const push = (match: ZoneMatch) => {
		if (seen.has(match.zone)) return
		seen.add(match.zone)
		out.push(match)
	}

	const typedOffset = normalizeOffset(query)
	if (typedOffset) push(fromZone(typedOffset))
	if (q === 'utc' || q === 'gmt') push(fromZone('UTC'))

	for (const cc of matchCountries(q)) for (const match of countryMatches(cc)) push(match)
	for (const entry of zones) if (entry.cityKey.startsWith(q)) push(cityMatch(entry))
	const listed = new Set(zones.map(z => z.zone))
	for (const [key, old, current] of links) {
		// Some old names are still listed zones in zone.tab (America/Curacao); those match as cities.
		if (listed.has(old)) continue
		const last = key.split(' ').pop() ?? key
		if (last.startsWith(q) || key === q) push({ ...fromZone(current), detail: `Old name: ${old}` })
	}
	if (q.length >= 3) {
		for (const entry of zones) if (entry.cityKey.includes(q) || entry.pathKey.includes(q)) push(cityMatch(entry))
		for (const entry of zones) if (entry.noteKey.includes(q)) push(cityMatch(entry))
	}
	// A zone typed in full that isn't in zone.tab ("Etc/GMT+3", "EST5EDT").
	const typed = query.trim()
	// Titled with the name as typed: Etc/GMT+3 is UTC−3, so its last part alone would mislead.
	if (/^[A-Za-z]/.test(typed) && typed.length >= 3 && !seen.has(typed) && isValidZone(typed)) push({ zone: typed, title: typed })
	// Half-typed offsets ("+5:3", "-9") match the list with or without the leading zero.
	const bare = typed.replace(/^(?:utc|gmt)\s*/i, '')
	if (/^[+-]\d/.test(bare)) {
		for (const offset of OFFSETS) {
			if (offset.startsWith(bare) || offset.replace(/^([+-])0/, '$1').startsWith(bare)) push(fromZone(offset))
		}
	}
	return out.slice(0, limit)
}
