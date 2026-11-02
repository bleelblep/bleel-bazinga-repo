/**
 * Search and sort for the rule lists. Display only: rules still run in their saved order, top to
 * bottom, whatever order the list is shown in.
 */

import { getStorage, settings } from './state'
import { compileRule } from './textReplace'
import type { SendTweaksStorage } from '../types'
import type { RuleKind } from './ruleStore'
import type { Rule } from './textReplace'

export type SortMode =
	| 'default'
	| 'name-asc'
	| 'name-desc'
	| 'find-asc'
	| 'enabled-first'
	| 'disabled-first'
	| 'errors-first'

export const SORT_MODES: { value: SortMode; label: string; short: string }[] = [
	{ value: 'default', label: 'Default', short: 'Default' },
	{ value: 'name-asc', label: 'Name (A → Z)', short: 'Name' },
	{ value: 'name-desc', label: 'Name (Z → A)', short: 'Name, Z to A' },
	{ value: 'find-asc', label: 'Find pattern (A → Z)', short: 'Find pattern' },
	{ value: 'enabled-first', label: 'On first', short: 'On first' },
	{ value: 'disabled-first', label: 'Off first', short: 'Off first' },
	{ value: 'errors-first', label: 'Not working first', short: 'Not working first' },
]

const KEY = { text: 'textRulesSort', links: 'linkRulesSort' } as const

/** Pass `useSettings()` from a component so it re-renders when the choice changes. */
export function sortModeOf(
	kind: RuleKind,
	s: SendTweaksStorage = settings(),
): SortMode {
	const saved = s[KEY[kind]]
	return SORT_MODES.some(mode => mode.value === saved)
		? (saved as SortMode)
		: 'default'
}

export function setSortMode(kind: RuleKind, mode: SortMode) {
	getStorage()?.set({ [KEY[kind]]: mode })
}

/** Rules whose name, find or replace contains the search, ignoring case. */
export function searchRules(rules: Rule[], search: string): Rule[] {
	const query = search.trim().toLowerCase()
	if (!query) return rules
	return rules.filter(rule =>
		[rule.name ?? '', rule.find ?? '', rule.replace ?? ''].some(field =>
			field.toLowerCase().includes(query),
		),
	)
}

const nameOf = (rule: Rule) => (rule.name || rule.find || '').toLowerCase()
const broken = (rule: Rule) => (rule.find && compileRule(rule).error ? 1 : 0)

/** A sorted copy; `default` keeps the saved order. Ties keep the saved order too. */
export function sortRules(rules: Rule[], mode: SortMode): Rule[] {
	if (mode === 'default') return rules
	return [...rules].sort((a, b) => {
		switch (mode) {
			case 'name-asc':
				return nameOf(a).localeCompare(nameOf(b))
			case 'name-desc':
				return nameOf(b).localeCompare(nameOf(a))
			case 'find-asc':
				return (a.find || '').toLowerCase().localeCompare((b.find || '').toLowerCase())
			case 'enabled-first':
				return Number(!!b.enabled) - Number(!!a.enabled)
			case 'disabled-first':
				return Number(!!a.enabled) - Number(!!b.enabled)
			case 'errors-first':
				return broken(b) - broken(a)
			default:
				return 0
		}
	})
}
