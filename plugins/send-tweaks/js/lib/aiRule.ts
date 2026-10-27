/**
 * Writing a rule from a plain-language description, through AI Core.
 *
 * Only reachable when AI Core is installed (`getAi()`); the Ready-made screens hide the whole
 * section otherwise. One call per rule, from AI Core's shared daily budget. Only the description is
 * sent -- never a message.
 *
 * ## Why the model also writes examples
 *
 * Model-written regex is often almost right. So the model returns two or three example inputs with
 * the output it expects, and those are run through the rule here, on the device, with the same
 * `applyRules` that sending uses. The user sees each pass or fail before deciding to add the rule,
 * and nothing is added automatically. The rule also goes through `compileRule`, so the freeze guard
 * and invalid-pattern checks apply exactly as they do to an imported rule.
 *
 * A link rule's examples are single URLs, because that is all a link rule ever sees; a text rule's
 * are short messages.
 */

import { reportError } from '../../../../shared/report'
import { importRules } from './importRules'
import { getAi } from './state'
import { applyRules, compileRule, newRule } from './textReplace'
import type { RuleKind } from './ruleStore'
import type { Rule } from './textReplace'

export interface Example {
	input: string
	expected: string
	got: string
	pass: boolean
}

export type Draft =
	| { ok: true; rule: Rule; examples: Example[] }
	| { ok: false; error: string }

interface ModelAnswer {
	name?: unknown
	find?: unknown
	replace?: unknown
	regex?: unknown
	caseSensitive?: unknown
	wholeWord?: unknown
	examples?: unknown
}

const SHARED = `You write one find-and-replace rule for a Discord client plugin, from the user's description.
Reply with a single JSON object and nothing else:
{"name": string, "find": string, "replace": string, "regex": boolean, "caseSensitive": boolean, "wholeWord": boolean,
 "examples": [{"input": string, "output": string}, ...]}

Rules:
- "find" is plain text, or a JavaScript regular expression when "regex" is true. Do not include slashes or flags.
- The rule always replaces every match. "caseSensitive": false matches any capitalisation.
- In "replace", $1, $2 refer to captured groups (regex only).
- Never put a repeated group inside another repeat, such as (a+)+ or (\\w+\\s?)*: the plugin refuses them.
- Do not use lookbehind ((?< = or (?<!); lookahead is fine.
- "wholeWord" only applies to plain-text rules; set it false for regex.
- Give 2 or 3 examples, including one the rule must leave unchanged, with the exact expected output.
- "name" is a short label, like "Twitter to fxtwitter".`

const LINKS = `${SHARED}
- This is a LINK rule. It runs on one URL at a time, after tracking parameters have been removed, and
  never on the rest of the message. Every example input and output is a single full URL.
- Typical use: swapping a site for a service that embeds it better in Discord. Only use a replacement
  domain you are confident still exists; say which service it is in "name".`

const TEXT = `${SHARED}
- This is a TEXT rule. It runs on the words of a message; links, mentions, custom emoji, timestamps
  and code blocks are never touched, so do not try to match them. Example inputs are short messages.`

const asString = (value: unknown) => (typeof value === 'string' ? value : '')

/**
 * Attempt to create a rule from the user description.
 * If the description itself is a valid JSON rule, we parse it locally and skip the AI call.
 * Otherwise we fall back to AI Core.
 */
export async function draftRule(
	kind: RuleKind,
	description: string,
): Promise<Draft> {
	// Fast-path: user supplied or embedded a ready-made JSON rule in description
	const imported = importRules(description)
	if (imported.rules.length > 0) {
		const rule = imported.rules[0]
		return { ok: true, rule, examples: [] }
	}
	if (
		imported.skipped.length > 0 &&
		(description.includes('{') || description.includes('```'))
	) {
		return { ok: false, error: `Invalid rule: ${imported.skipped[0]}` }
	}

	const ai = getAi()
	if (!ai) return { ok: false, error: 'AI Core is not installed.' }
	if (!ai.isAvailable()) {
		return {
			ok: false,
			error:
				"AI Core can't make calls right now: set a key in its settings, or today's limit is used up.",
		}
	}

	// Sanitize description: limit size to 2048 characters to prevent provider rejections,
	// and escape raw control characters
	const sanitized = description
		.trim()
		.slice(0, 2048)
		// biome-ignore lint/suspicious/noControlCharactersInRegex: strips control characters from the model's reply
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

	let answer: ModelAnswer | undefined
	try {
		answer = await ai.json<ModelAnswer>({
			messages: [
				{ role: 'system', content: kind === 'links' ? LINKS : TEXT },
				{ role: 'user', content: sanitized },
			],
			temperature: 0,
			maxTokens: 700,
			timeoutMs: 30_000,
		})
	} catch (error) {
		reportError('[SendTweaks] AI rule request failed:', error)
		const message = error instanceof Error ? error.message : ''
		return {
			ok: false,
			error: message
				? `AI request error: ${message}`
				: 'AI request failed. Check your API key or description.',
		}
	}
	if (!answer || typeof answer !== 'object') {
		return {
			ok: false,
			error:
				'No usable answer came back. Try again, or describe it differently.',
		}
	}

	const find = asString(answer.find)
	if (!find)
		return {
			ok: false,
			error:
				"The answer didn't include anything to find. Try describing it differently.",
		}

	const regex = answer.regex === true
	const rule = newRule({
		name: asString(answer.name).trim() || undefined,
		find,
		replace: asString(answer.replace),
		regex,
		caseSensitive: answer.caseSensitive === true,
		wholeWord: !regex && kind !== 'links' && answer.wholeWord !== false,
		enabled: true,
	})

	const compiled = compileRule(rule)
	if (compiled.error)
		return {
			ok: false,
			error: `The rule it wrote can't be used: ${compiled.error}`,
		}

	const examples: Example[] = (
		Array.isArray(answer.examples) ? answer.examples : []
	)
		.slice(0, 5)
		.map(
			(
				example:
					| { input?: unknown; output?: unknown; expected?: unknown }
					| null
					| undefined,
			) => {
				const input = asString(example?.input)
				const expected = asString(example?.output ?? example?.expected)
				const got = applyRules(input, [rule]).text
				return { input, expected, got, pass: got === expected }
			},
		)
		.filter(example => example.input)

	return { ok: true, rule, examples }
}
