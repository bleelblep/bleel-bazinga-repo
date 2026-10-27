import { isKnownPlaceholder } from './greetings'
import { discordTimestamp, expandSnippets, formatLocal } from './templateSyntax'
import type { Snippet } from './templateSyntax'

/** Advisory only: never block sending or silently repair a template. */
export function validateTemplate(
	template: string,
	output: string,
	snippets: Snippet[] = [],
	limit = 2000,
): string[] {
	const warnings: string[] = []
	const expanded = expandSnippets(template, snippets)
	if (/\{snippet:[^{}]+\}/.test(expanded))
		warnings.push('A snippet is missing, cyclic, or nested too deeply.')
	let depth = 0
	for (const ch of template) {
		if (ch === '{') depth++
		if (ch === '}') depth--
	}
	if (depth !== 0) warnings.push('Unbalanced template braces.')
	if (/\$(?:random|shuffle)\{\s*,?\s*\}/.test(template))
		warnings.push('A choice block has no non-empty choices.')
	for (const match of expanded.matchAll(
		/\{(\w+)(?::([^{}|]+))?(?:\|[^{}]*)?\}/g,
	)) {
		const [, key, argument] = match
		if (key === 'snippet') continue
		if (!isKnownPlaceholder(key)) {
			warnings.push(`Unknown placeholder: ${match[0]}`)
		} else if (key === 'timestamp' && !discordTimestamp(new Date(), argument))
			warnings.push(`Invalid timestamp format: ${match[0]}`)
		else if (
			(key === 'date' || key === 'time') &&
			argument &&
			formatLocal(new Date(), argument, key) === undefined
		)
			warnings.push(`Invalid ${key} format: ${match[0]}`)
		else if (
			(key === 'joined' || key === 'created') &&
			argument &&
			!/^[tTdDfFR]$/.test(argument)
		)
			warnings.push(`Invalid timestamp style: ${match[0]}`)
	}
	const ticks = output.replace(/\\`/g, '').match(/`+/g) ?? []
	let open = ''
	for (const tick of ticks) {
		if (!open) open = tick
		else if (tick === open) open = ''
	}
	if (open)
		warnings.push(
			'An inline-code or code-block backtick delimiter is unclosed.',
		)
	if (output.length > limit)
		warnings.push(
			`Output is ${output.length} characters; the preview limit is ${limit}.`,
		)
	return [...new Set(warnings)]
}
