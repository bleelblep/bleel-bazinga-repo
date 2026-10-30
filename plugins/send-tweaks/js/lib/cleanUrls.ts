/**
 * Taking the tracking off links before they are sent.
 *
 * Every `?si=`, `utm_source=` and `fbclid=` tells the site who shared the link, where, and often
 * with whom. None of it affects where the link goes. Removing it is the most requested unported
 * plugin in this ecosystem by some distance.
 *
 * ## Why this parses by hand
 *
 * React Native's `URL` polyfill has historically thrown on `.search` and `.searchParams`, and
 * whether a given build has fixed that is not something to bet a send on. So query strings are
 * split on `&` and `=` directly, and every parameter that is *kept* is kept byte for byte —
 * nothing is decoded and re-encoded, so a link can only ever lose tracking, never have its
 * meaningful parts rewritten.
 *
 * ## What is removed
 *
 * Parameters that are tracking on every site (the `utm_*` family, ad click ids) are removed
 * everywhere. Parameters that are only tracking on one site — `si` on YouTube and Spotify, `s`
 * and `t` on X — are removed only there, because on another site the same name can be the
 * content itself.
 *
 * With "ClearURLs rules" on, the community rule set (lib/clearurls.ts) is consulted as well, and a
 * redirect link it knows is replaced by its destination. A few parameters are kept whatever either
 * list says, where they change the page (`keptOn`).
 */

import { clearUrlsRedirect, clearUrlsTracks, keptOn } from './clearurls'
import { splitUrl } from './urlBounds'

/** Tracking on every site. */
const GLOBAL = new Set([
	'fbclid',
	'gclid',
	'gclsrc',
	'dclid',
	'gbraid',
	'wbraid',
	'msclkid',
	'yclid',
	'twclid',
	'ttclid',
	'li_fat_id',
	'mc_cid',
	'mc_eid',
	'_hsenc',
	'_hsmi',
	'hsctatracking',
	'mkt_tok',
	'igshid',
	'igsh',
	'_ga',
	'_gl',
	'ref_src',
	'ref_url',
	'rb_clickid',
	'epik',
	'oly_anon_id',
	'oly_enc_id',
	'vero_id',
	'vero_conv',
	'wickedid',
	'__s',
	's_cid',
	'ncid',
	'cmpid',
	'ocid',
	'spm',
	'trk',
	'trkcampaign',
	'sc_channel',
	'sc_campaign',
	// Also stripped everywhere by Firefox's query stripping and/or the ClearURLs global rules.
	'srsltid',
	'ysclid',
	'_openstat',
	'__hsfp',
	'__hssc',
	'__hstc',
	'mc_tc',
	'ml_subscriber',
	'ml_subscriber_hash',
	'os_ehash',
	'wtrid',
	'tracking_source',
	'fb_action_ids',
	'fb_action_types',
	'fb_source',
	'fb_ref',
	'action_object_map',
	'action_type_map',
	'action_ref_map',
	'__twitter_impression',
])

/** Tracking prefixes on every site. */
const GLOBAL_PREFIXES = [
	'utm_',
	'hsa_',
	'pk_',
	'piwik_',
	'matomo_',
	'mtm_',
	'stm_',
	'hmb_',
	'otm_',
	'itm_',
]

/** Tracking only on particular sites, where the same name elsewhere may mean something. */
const PER_HOST: Array<[RegExp, Set<string>]> = [
	[
		/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/,
		new Set(['si', 'feature', 'pp', 'ab_channel', 'kw']),
	],
	[/(^|\.)spotify\.com$/, new Set(['si', 'context', 'nd', 'dlsi'])],
	[
		/(^|\.)(twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com|fixvx\.com)$/,
		// `a` is the share token on links from X's share sheet.
		new Set(['s', 't', 'a', 'ref_src', 'src', 'cn', 'ref_url']),
	],
	[
		/(^|\.)instagram\.com$/,
		// `stkn` and `igsi` are share tokens tying the click to whoever shared it (ClearURLs issue #534).
		// `vrfl` is the newer share tag on post links (a base64 id, like `igsh` before it).
		new Set([
			'igsh',
			'igshid',
			'img_index',
			'utm_source',
			'stkn',
			'igsi',
			'vrfl',
		]),
	],
	[
		/(^|\.)tiktok\.com$/,
		new Set([
			'_r',
			'_t',
			'is_from_webapp',
			'sender_device',
			'is_copy_url',
			'web_id',
			'share_app_id',
			'share_link_id',
			'share_item_id',
			'social_sharing',
			'source',
			'u_code',
			'user_id',
			'tt_from',
			'checksum',
			'sec_user_id',
			'sec_uid',
			'timestamp',
			'enable_checksum',
			'preview_pb',
			'_d',
			'share_app_name',
			'share_iid',
		]),
	],
	[
		/(^|\.)reddit\.com$/,
		// Not `context`: on a comment permalink it sets how many parent comments show, so it
		// changes the page rather than tracking who shared it.
		new Set([
			'share_id',
			'ref',
			'ref_source',
			'ref_campaign',
			'rdt',
			'correlation_id',
			'$deep_link',
			'$3p',
			'$original_url',
			'_branch_match_id',
		]),
	],
	[/(^|\.)twitch\.(tv|com)$/, new Set(['tt_medium', 'tt_content'])],
	[/(^|\.)(steampowered|steamcommunity)\.com$/, new Set(['snr'])],
	[/(^|\.)netflix\.com$/, new Set(['trackid', 'tctx'])],
	[
		/(^|\.)etsy\.com$/,
		new Set(['click_key', 'click_sum', 'organic_search_click']),
	],
	[/(^|\.)medium\.com$/, new Set(['source'])],
	[/(^|\.)nytimes\.com$/, new Set(['smid'])],
	[/(^|\.)facebook\.com$/, new Set(['mibextid', 'rdid', 'sfnsn', 'share_url'])],
	[/(^|\.)linkedin\.com$/, new Set(['trackingid', 'lipi', 'refid', 'trk'])],
	[
		/(^|\.)amazon\.[a-z.]+$/,
		// Not `th` or `psc`: on many listings they select the size or colour variant, and removing
		// them can land the reader on a different product.
		new Set([
			'ref',
			'ref_',
			'pd_rd_i',
			'pd_rd_r',
			'pd_rd_w',
			'pd_rd_wg',
			'pf_rd_p',
			'pf_rd_r',
			'pf_rd_s',
			'pf_rd_t',
			'pf_rd_i',
			'pf_rd_m',
			'_encoding',
			'qid',
			'sr',
			'crid',
			'sprefix',
			'content-id',
			'linkcode',
			'linkid',
			'creativeasin',
			'ascsubtag',
			'dib',
			'dib_tag',
		]),
	],
	[
		/(^|\.)aliexpress\.[a-z.]+$/,
		new Set([
			'spm',
			'scm',
			'pvid',
			'algo_pvid',
			'algo_exp_id',
			'aff_platform',
			'aff_trace_key',
			'sk',
			'terminal_id',
			'gatewayadapt',
		]),
	],
	[
		/(^|\.)ebay\.[a-z.]+$/,
		new Set([
			'_trkparms',
			'_trksid',
			'hash',
			'amdata',
			'mkcid',
			'mkrid',
			'campid',
			'toolid',
			'customid',
			'mkevt',
		]),
	],
	[
		/(^|\.)(soundcloud\.com|on\.soundcloud\.com)$/,
		new Set(['si', 'ref', 'p', 'c']),
	],
]

/** Amazon also buries tracking in the path: `/dp/B0XXXX/ref=sr_1_3`. */
const AMAZON_PATH_REF = /\/ref=[^/?#]*/i

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi

function hostOf(url: string): string {
	const match = /^https?:\/\/([^/?#:]+)/i.exec(url)
	return match ? match[1].toLowerCase() : ''
}

function isTracking(key: string, host: string): boolean {
	const name = key.toLowerCase()
	if (GLOBAL.has(name)) return true
	if (GLOBAL_PREFIXES.some(prefix => name.startsWith(prefix))) return true
	for (const [pattern, keys] of PER_HOST) {
		if (pattern.test(host) && keys.has(name)) return true
	}
	return false
}

export interface CleanResult {
	url: string
	removed: string[]
}

/** Cleans one URL. Returns it unchanged, with nothing removed, when there is nothing to do. */
export function cleanUrl(raw: string, unwrapped = false): CleanResult {
	const host = hostOf(raw)
	if (!host) return { url: raw, removed: [] }

	// A redirect link ClearURLs knows (Google's /url?q=, for one) becomes its destination, which is
	// then cleaned in turn. Once only, so a redirect that points at another can't loop.
	if (!unwrapped) {
		const target = clearUrlsRedirect(raw)
		if (target && target !== raw) {
			const inner = cleanUrl(target, true)
			return { url: inner.url, removed: ['redirect', ...inner.removed] }
		}
	}

	// Split off the fragment first; it is never touched.
	const hashAt = raw.indexOf('#')
	const beforeHash = hashAt === -1 ? raw : raw.slice(0, hashAt)
	const fragment = hashAt === -1 ? '' : raw.slice(hashAt)

	const queryAt = beforeHash.indexOf('?')
	let path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)
	const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1)

	const removed: string[] = []

	if (/(^|\.)amazon\.[a-z.]+$/.test(host) && AMAZON_PATH_REF.test(path)) {
		path = path.replace(AMAZON_PATH_REF, '')
		removed.push('ref (path)')
	}

	const kept: string[] = []
	for (const pair of query ? query.split('&') : []) {
		if (!pair) continue
		const key = pair.split('=')[0]
		let name = key
		try {
			name = decodeURIComponent(key)
		} catch {
			/* a malformed key is compared as written */
		}
		const tracking =
			!keptOn(host, name) &&
			(isTracking(name, host) ||
				clearUrlsTracks(raw, name) ||
				(key !== name && clearUrlsTracks(raw, key)))
		if (tracking) removed.push(name)
		else kept.push(pair)
	}

	if (!removed.length) return { url: raw, removed }

	const rebuilt = `${path}${kept.length ? `?${kept.join('&')}` : ''}${fragment}`
	return { url: rebuilt, removed }
}

/**
 * Runs `change` on every URL in a stretch of prose.
 *
 * Trailing sentence punctuation is split off first and put back after, so "see
 * https://x.com/a?s=20." keeps its full stop and a change never sees it as part of the link.
 */
export function mapUrls(text: string, change: (url: string) => string): string {
	URL_PATTERN.lastIndex = 0
	return text.replace(URL_PATTERN, (match, offset: number) => {
		const { url, tail } = splitUrl(match, text.slice(0, offset))
		return change(url) + tail
	})
}

/** Cleans every URL in a stretch of prose. */
export function cleanText(text: string): { text: string; removed: number } {
	let removed = 0
	const cleaned = mapUrls(text, url => {
		const result = cleanUrl(url)
		removed += result.removed.length
		return result.url
	})
	return { text: cleaned, removed }
}
