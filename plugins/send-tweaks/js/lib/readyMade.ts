/**
 * The ready-made rules, kept up to date from a file in the Bazinga repo, so a rule can be added or
 * fixed (a site changes its links, a fixer shuts down) without shipping a plugin update.
 *
 * The file is `PRESETS`' shape as JSON: `{ "format": 1, "presets": [ … ] }`. It is downloaded when
 * the ready-made screen opens and is a few hours old, and about weekly on start if you have a rule
 * from it, so the yellow card on the rule lists stays current. Nothing is ever changed for you: a
 * newer version of a rule you added shows as an update you tap to take, and a retired one (see
 * `Preset.retired`) as a rule you tap to remove. A hidden one (`Preset.hidden`) is just no longer
 * offered; anyone who has it keeps it and hears nothing.
 *
 * The built-in `PRESETS` stay the fallback for no network, a bad download or an old file. Per id,
 * whichever of the two has the higher `version` wins. A download is a plain anonymous GET of a
 * public file (account-safety AS-02): no credentials, one fixed host, a time limit and a size cap,
 * and every rule in it has to compile, freeze guard included, or it is dropped.
 */

import { DEFAULTS } from '../defaults'
import { PRESETS } from './importRules'
import { readRules, updateRule } from './ruleStore'
import { debug, getStorage, settings, TAG } from './state'
import { compileRule, newRule, sanitizeFlags } from './textReplace'
import type { ReadyMadeData } from '../types'
import type { Preset } from './importRules'
import type { RuleKind } from './ruleStore'
import type { Rule } from './textReplace'

const DEBUG: boolean = false

const SOURCE =
	'https://bleelblep.github.io/bleel-bazinga-repo/ready-made-rules.json'
const HOST = 'https://bleelblep.github.io/'

const HOUR = 60 * 60 * 1000
export const SCREEN_MAX_AGE = 6 * HOUR
const WEEK = 7 * 24 * HOUR
const TIMEOUT_MS = 15_000
const MAX_CHARS = 256 * 1024
const MAX_PRESETS = 200
const MAX_FIELD = 2000

const SOURCES: Preset['source'][] = ['thread', 'updated', 'added']

/**
 * Goes up whenever `toPreset` learns a new field. 2: `hidden` and `shows` (1.0.21). A saved list
 * from an older parser is missing those, and would win over the built-in copy on a tie.
 */
const PARSER = 2

/** The saved list, or null when an older parser saved it. */
function usable(
	data: ReadyMadeData | null | undefined,
): ReadyMadeData | null {
	return data?.parsedBy === PARSER ? data : null
}

const str = (value: unknown, max: number): string | undefined =>
	typeof value === 'string' && value.length <= max ? value : undefined

/** The "from → to" line, only when both sides are short strings. */
function toShows(raw: unknown): Preset['shows'] {
	if (!raw || typeof raw !== 'object') return undefined
	const s = raw as Record<string, unknown>
	const from = str(s.from, 100)
	const to = str(s.to, 100)
	return from && to ? { from, to } : undefined
}

/** One preset from the file, checked field by field. Undefined if anything is off. */
function toPreset(raw: unknown): Preset | undefined {
	if (!raw || typeof raw !== 'object') return undefined
	const p = raw as Record<string, unknown>
	const r = (p.rule ?? {}) as Record<string, unknown>
	const id = str(p.id, 64)
	if (!id || !/^[a-z0-9-]+$/.test(id)) return undefined
	if (
		typeof p.version !== 'number' ||
		!Number.isInteger(p.version) ||
		p.version < 1
	)
		return undefined
	if (p.kind !== 'links' && p.kind !== 'text') return undefined
	const find = str(r.find, MAX_FIELD)
	const replace = str(r.replace, MAX_FIELD)
	if (!find || replace === undefined) return undefined
	const rule: Preset['rule'] = {
		name: str(r.name, 100) || undefined,
		find,
		replace,
		regex: r.regex === true,
		caseSensitive: r.caseSensitive === true,
		wholeWord: r.wholeWord === true,
		extraFlags: sanitizeFlags(str(r.extraFlags, 8)) || undefined,
	}
	if (compileRule(newRule(rule)).error) return undefined
	return {
		id,
		version: p.version,
		kind: p.kind,
		source: SOURCES.find(source => source === p.source) ?? 'added',
		note: str(p.note, 500) ?? '',
		retired: p.retired === true || undefined,
		hidden: p.hidden === true || undefined,
		shows: toShows(p.shows),
		legacyFinds: Array.isArray(p.legacyFinds)
			? p.legacyFinds
					.filter((f): f is string => !!str(f, MAX_FIELD))
					.slice(0, 20)
			: undefined,
		rule,
	}
}

function parse(json: unknown): Preset[] {
	const file = json as { format?: unknown; presets?: unknown } | undefined
	if (file?.format !== 1) throw new Error('not a format 1 rules file')
	if (!Array.isArray(file.presets)) throw new Error('the file has no presets')
	const seen = new Set<string>()
	const out: Preset[] = []
	for (const raw of file.presets.slice(0, MAX_PRESETS)) {
		const preset = toPreset(raw)
		if (!preset || seen.has(preset.id)) continue
		seen.add(preset.id)
		out.push(preset)
	}
	if (!out.length) throw new Error('the file has no usable rules')
	return out
}

/**
 * The list to show: the downloaded file's order, then any built-in it doesn't have. Per id, the
 * higher version wins, so an older file never undoes a fix that shipped in the plugin.
 */
export function mergePresets(data: ReadyMadeData | null | undefined): Preset[] {
	const remote = data?.presets
	if (!remote?.length) return PRESETS
	const builtIn = new Map(PRESETS.map(preset => [preset.id, preset]))
	const merged = remote.map(preset => {
		const local = builtIn.get(preset.id)
		return local && local.version > preset.version ? local : preset
	})
	const ids = new Set(remote.map(preset => preset.id))
	return [...merged, ...PRESETS.filter(preset => !ids.has(preset.id))]
}

/** Subscribes the calling component to storage and returns the current list. */
export function useReadyMade(): {
	presets: Preset[]
	updatedAt?: number
} {
	const data = usable(
		{ ...DEFAULTS, ...(getStorage()?.use() ?? {}) }.readyMadeData,
	)
	return { presets: mergePresets(data), updatedAt: data?.updatedAt }
}

export function currentPresets(): Preset[] {
	return mergePresets(usable(settings().readyMadeData))
}

export interface Link {
	rule: Rule
	/** A newer version of the preset than the one this rule came from. Never set when retired. */
	outdated: boolean
	/** The preset has been retired: offer to remove the rule. */
	retired: boolean
}

/**
 * Your rule that came from this preset, if any. Rules added before rules were linked by id are
 * recognised by their `find`: today's means up to date, an old one from `legacyFinds` means outdated.
 */
export function linkFor(rules: Rule[], preset: Preset): Link | undefined {
	const link = (rule: Rule, outdated: boolean): Link =>
		preset.retired
			? { rule, outdated: false, retired: true }
			: { rule, outdated, retired: false }
	for (const rule of rules) {
		if (rule.preset) {
			if (rule.preset.id === preset.id)
				return link(rule, rule.preset.version < preset.version)
		} else if (rule.find === preset.rule.find) {
			return link(rule, false)
		} else if (preset.legacyFinds?.includes(rule.find)) {
			return link(rule, true)
		}
	}
	return undefined
}

/** Your rules that need a tap: an update waiting, or retired. Keyed by rule id. */
export function needingAttention(
	rules: Rule[],
	presets: Preset[],
): Map<string, Link> {
	const out = new Map<string, Link>()
	for (const preset of presets) {
		const link = linkFor(rules, preset)
		if (link && (link.outdated || link.retired)) out.set(link.rule.id, link)
	}
	return out
}

/** The yellow card's title for this mix of updates and retired rules. */
export function attentionTitle(links: Iterable<Link>): string {
	let updates = 0
	let retired = 0
	for (const link of links) {
		if (link.retired) retired++
		else updates++
	}
	const n = updates + retired
	const rules = n === 1 ? '1 rule' : `${n} rules`
	if (!retired) return `${rules} ${n === 1 ? 'needs' : 'need'} updating`
	if (!updates) return `${rules} no longer ${n === 1 ? 'works' : 'work'}`
	return `${rules} ${n === 1 ? 'needs' : 'need'} your attention`
}

/**
 * Swaps in the preset's current rule, keeping what is yours: on or off, where it runs, live typing,
 * and the rule's place in the list.
 */
export function applyUpdate(kind: RuleKind, rule: Rule, preset: Preset) {
	const { name, find, replace, regex, caseSensitive, wholeWord, extraFlags } =
		preset.rule
	updateRule(kind, rule.id, {
		name,
		find,
		replace,
		regex,
		caseSensitive,
		wholeWord,
		extraFlags,
		preset: { id: preset.id, version: preset.version },
	})
}

async function download(): Promise<Preset[]> {
	const controller =
		typeof AbortController === 'function' ? new AbortController() : undefined
	const timer = setTimeout(() => controller?.abort(), TIMEOUT_MS)
	try {
		const response = await fetch(SOURCE, {
			signal: controller?.signal,
			credentials: 'omit',
			headers: { 'Cache-Control': 'no-cache' },
		})
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		// Only ever the one host, even after a redirect.
		if (response.url && !response.url.startsWith(HOST))
			throw new Error('redirected off GitHub Pages')
		const text = await response.text()
		if (text.length > MAX_CHARS) throw new Error('the file is too big')
		return parse(JSON.parse(text))
	} finally {
		clearTimeout(timer)
	}
}

export interface UpdateResult {
	ok: boolean
	count?: number
	error?: string
}

let inFlight: Promise<UpdateResult> | undefined

/** Downloads the list now. Keeps the old one if it fails. */
export function updateReadyMade(): Promise<UpdateResult> {
	if (inFlight) return inFlight
	inFlight = (async () => {
		try {
			const presets = await download()
			const data: ReadyMadeData = {
				updatedAt: Date.now(),
				presets,
				parsedBy: PARSER,
			}
			getStorage()?.set({ readyMadeData: data })
			debug(`ready-made rules updated: ${presets.length}`)
			return { ok: true, count: presets.length }
		} catch (error) {
			const message = String((error as Error)?.message ?? error)
			if (DEBUG) console.warn(`${TAG} ready-made download failed:`, message)
			return { ok: false, error: message }
		}
	})().finally(() => {
		inFlight = undefined
	})
	return inFlight
}

/** Downloads if the stored list is older than `maxAge`. Quiet: a failure keeps the old list. */
export function refreshReadyMadeIfStale(maxAge = SCREEN_MAX_AGE) {
	const age = Date.now() - (usable(settings().readyMadeData)?.updatedAt ?? 0)
	if (age < maxAge) return
	updateReadyMade().catch(() => {})
}

/** On start: about weekly, and only for someone with a ready-made rule, who can use an update. */
export function refreshReadyMadeOnStart() {
	const presets = currentPresets()
	const kinds: RuleKind[] = ['links', 'text']
	const hasLinked = kinds.some(kind => {
		const rules = readRules(kind)
		return presets.some(preset => linkFor(rules, preset))
	})
	if (hasLinked) refreshReadyMadeIfStale(WEEK)
}
