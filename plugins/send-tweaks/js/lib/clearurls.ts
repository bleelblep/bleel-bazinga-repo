/**
 * The ClearURLs community rules (https://docs.clearurls.xyz), on top of the built-in list in
 * cleanUrls.ts.
 *
 * ClearURLs keeps one JSON file of tracking parameters for about two hundred sites and updates it as
 * sites change their tracking. It is downloaded here, trimmed to what link cleaning uses, and kept in
 * storage; it is never bundled with the plugin. It refreshes itself about once a week, and the
 * settings page can refresh it on demand. The built-in list keeps working with no network and no
 * download at all.
 *
 * How a provider applies, as in the ClearURLs extension: its `urlPattern` must match the whole URL
 * and none of its `exceptions` may. Each rule is a regex for a parameter *name* and must match the
 * whole name. A `redirection` whose first group matches is the real destination of a redirect link
 * (Google's `/url?q=`, for one), which replaces the link. Referral-marketing rules (affiliate tags)
 * are left out on purpose: they are not tracking of the person sharing, and removing them is
 * something the ClearURLs extension itself leaves off by default.
 */

import { debug, getStorage, settings, TAG } from './state'
import type { ClearUrlsData, ClearUrlsProvider } from '../types'

const DEBUG: boolean = false

/** The official rules file, then its mirror on GitLab. */
const SOURCES = [
	'https://rules2.clearurls.xyz/data.minify.json',
	'https://gitlab.com/ClearURLs/rules/-/raw/master/data.min.json',
]

const WEEK = 7 * 24 * 60 * 60 * 1000
const TIMEOUT_MS = 15_000

/**
 * Parameters kept whatever the rules say, because on these sites they change what the link shows.
 * ClearURLs lists `th` for Amazon, but on many listings it picks the size or colour variant.
 */
const KEEP: Array<[RegExp, Set<string>]> = [
	[/(^|\.)amazon\.[a-z.]+$/, new Set(['th', 'psc'])],
]

export function keptOn(host: string, name: string): boolean {
	const lower = name.toLowerCase()
	return KEEP.some(([pattern, keys]) => pattern.test(host) && keys.has(lower))
}

interface Compiled {
	pattern: RegExp
	rules: RegExp[]
	exceptions: RegExp[]
	redirections: RegExp[]
}

let compiledFor = -1
let compiled: Compiled[] = []

function compile(source: string, flags = 'i'): RegExp | undefined {
	try {
		return new RegExp(source, flags)
	} catch {
		// A rule this engine can't parse costs that one rule, not the provider or the send.
		return undefined
	}
}

/** The stored rules, compiled once per download. Empty when switched off or never downloaded. */
function providers(): Compiled[] {
	const s = settings()
	const data = s.clearUrlsData
	if (!s.clearUrlsRules || !data?.providers?.length) return []
	if (compiledFor === data.updatedAt) return compiled
	compiled = data.providers.flatMap(provider => {
		const pattern = compile(provider.pattern)
		if (!pattern) return []
		const all = (sources: string[]) =>
			sources.map(s => compile(s)).filter((r): r is RegExp => !!r)
		return [
			{
				pattern,
				rules: provider.rules
					.map(rule => compile(`^(?:${rule})$`))
					.filter((r): r is RegExp => !!r),
				exceptions: all(provider.exceptions),
				redirections: all(provider.redirections),
			},
		]
	})
	compiledFor = data.updatedAt
	return compiled
}

/** The providers that apply to this URL: pattern matches, no exception does. */
function applying(url: string): Compiled[] {
	return providers().filter(
		p => p.pattern.test(url) && !p.exceptions.some(e => e.test(url)),
	)
}

/** Whether ClearURLs calls this parameter tracking on this URL. */
export function clearUrlsTracks(url: string, name: string): boolean {
	for (const provider of applying(url)) {
		if (provider.rules.some(rule => rule.test(name))) return true
	}
	return false
}

/** The real destination if this is a redirect link ClearURLs knows, else undefined. */
export function clearUrlsRedirect(url: string): string | undefined {
	for (const provider of applying(url)) {
		for (const redirection of provider.redirections) {
			const target = redirection.exec(url)?.[1]
			if (!target) continue
			let decoded = target
			try {
				decoded = decodeURIComponent(target)
			} catch {
				/* use it as written */
			}
			if (/^https?:\/\//i.test(decoded)) return decoded
		}
	}
	return undefined
}

/** Only what cleaning needs, so storage holds a fraction of the download. */
/** One provider as ClearURLs publishes it, before anything is checked. */
interface RawProvider {
	urlPattern?: unknown
	completeProvider?: unknown
	rules?: unknown
	exceptions?: unknown
	redirections?: unknown
}

function trim(json: unknown): ClearUrlsProvider[] {
	const list = (json as { providers?: unknown } | undefined)?.providers
	if (!list || typeof list !== 'object')
		throw new Error('the file has no providers')
	const strings = (value: unknown) =>
		Array.isArray(value)
			? value.filter((v): v is string => typeof v === 'string')
			: []
	const out: ClearUrlsProvider[] = []
	for (const provider of Object.values(
		list as Record<string, RawProvider | undefined>,
	)) {
		if (typeof provider?.urlPattern !== 'string') continue
		// A provider that blocks the whole site (completeProvider) is not ours to enforce.
		if (provider.completeProvider) continue
		const rules = strings(provider.rules)
		const redirections = strings(provider.redirections)
		if (!rules.length && !redirections.length) continue
		out.push({
			pattern: provider.urlPattern,
			rules,
			exceptions: strings(provider.exceptions),
			redirections,
		})
	}
	if (!out.length) throw new Error('the file has no usable rules')
	return out
}

async function download(url: string): Promise<ClearUrlsProvider[]> {
	const controller =
		typeof AbortController === 'function' ? new AbortController() : undefined
	const timer = setTimeout(() => controller?.abort(), TIMEOUT_MS)
	try {
		const response = await fetch(url, {
			signal: controller?.signal,
			headers: { 'Cache-Control': 'no-cache' },
		})
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		return trim(await response.json())
	} finally {
		clearTimeout(timer)
	}
}

export interface UpdateResult {
	ok: boolean
	/** Sites covered, when it worked. */
	count?: number
	error?: string
}

let inFlight: Promise<UpdateResult> | undefined

/** Downloads the rules now, trying each source in turn. Keeps the old rules if every source fails. */
export function updateClearUrls(): Promise<UpdateResult> {
	if (inFlight) return inFlight
	inFlight = (async () => {
		let lastError = 'no source answered'
		for (const source of SOURCES) {
			try {
				const providers = await download(source)
				const data: ClearUrlsData = { updatedAt: Date.now(), providers }
				getStorage()?.set({ clearUrlsData: data })
				debug(
					`ClearURLs rules updated from ${source}: ${providers.length} providers`,
				)
				return { ok: true, count: providers.length }
			} catch (error) {
				lastError = String((error as Error)?.message ?? error)
				if (DEBUG)
					console.warn(
						`${TAG} ClearURLs download from ${source} failed:`,
						lastError,
					)
			}
		}
		return { ok: false, error: lastError }
	})().finally(() => {
		inFlight = undefined
	})
	return inFlight
}

/** On start: download if switched on and the stored rules are missing or a week old. Quiet. */
export function refreshClearUrlsIfStale() {
	const s = settings()
	if (!s.cleanUrls || !s.clearUrlsRules) return
	const age = Date.now() - (s.clearUrlsData?.updatedAt ?? 0)
	if (age < WEEK) return
	updateClearUrls().catch(() => {})
}
