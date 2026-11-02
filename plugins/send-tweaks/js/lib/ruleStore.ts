/**
 * The two rule lists, as the settings screens read and write them.
 *
 * Every write replaces the *whole* list. `jsonStorage.set()` replaces arrays rather than merging
 * them, so that is what makes a deletion stick (see the note on `rules` in `types.ts`).
 */

import { DEFAULTS } from '../defaults'
import { getStorage } from './state'
import { newRule } from './textReplace'
import type { Rule } from './textReplace'

export type RuleKind = 'text' | 'links'

export const storageKey = (kind: RuleKind) =>
	kind === 'links' ? 'linkRules' : 'rules'

/** Subscribes the calling component to storage and returns that list. */
export function useRules(kind: RuleKind): Rule[] {
	const s = { ...DEFAULTS, ...(getStorage()?.use() ?? {}) }
	return s[storageKey(kind)] ?? []
}

export function readRules(kind: RuleKind): Rule[] {
	const s = { ...DEFAULTS, ...(getStorage()?.cache ?? {}) }
	return s[storageKey(kind)] ?? []
}

export function writeRules(kind: RuleKind, rules: Rule[]) {
	getStorage()?.set({ [storageKey(kind)]: rules })
}

/** What a rule does. Changing any of these makes it your own rule rather than a ready-made one. */
const CONTENT: Array<keyof Rule> = [
	'find',
	'replace',
	'regex',
	'caseSensitive',
	'wholeWord',
	'extraFlags',
]

export function updateRule(kind: RuleKind, id: string, patch: Partial<Rule>) {
	writeRules(
		kind,
		readRules(kind).map(rule => {
			if (rule.id !== id) return rule
			const next = { ...rule, ...patch }
			// Edited by hand: unlink it from its ready-made rule, so an update can't overwrite the
			// edit. The Edit rule screen saves the whole rule, so compare values, not keys.
			if (
				rule.preset &&
				!('preset' in patch) &&
				CONTENT.some(key => (next[key] ?? '') !== (rule[key] ?? ''))
			)
				delete next.preset
			return next
		}),
	)
}

/** Appends a rule and returns it. Link rules default to whole-word off: they match inside URLs. */
export function addRule(kind: RuleKind, overrides: Partial<Rule> = {}): Rule {
	const rule = newRule({ wholeWord: kind !== 'links', ...overrides })
	writeRules(kind, [...readRules(kind), rule])
	return rule
}

export function deleteRule(kind: RuleKind, id: string) {
	writeRules(
		kind,
		readRules(kind).filter(rule => rule.id !== id),
	)
}

/** The rule the Edit rule screen shows. A module variable: settings routes take no params. */
let editing: { kind: RuleKind; id: string } | undefined

export function setEditing(kind: RuleKind, id: string) {
	editing = { kind, id }
}

export function getEditing() {
	return editing
}
