import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import * as patcher from '@valenced/patcher'
import { after, before } from '@valenced/patcher'
import { reportError } from '../../../../shared/report'
import {
	count,
	countRowManager,
	noteDepth,
	noteRowType,
	noteSkippedRowTypeWithAuthor,
} from '../lib/diagnostics'
import { forgetOriginal, rememberOriginal } from '../lib/originals'
import { redactMessage } from '../lib/rowSchema'
import {
	isEnabled,
	preserveOriginalResolution,
	redactOptions,
	settings,
} from '../lib/state'
import { ensureChatManagerPatched } from './chatManager'
import { ensureDmHeaderPatched } from './dmHeader'

const DEBUG: boolean = false

/**
 * Chat redaction runs on the *data* a message row is built from, not on the rendered tree.
 *
 * `RowManager.prototype.generate` turns a raw message into the flat object the native row
 * renderer consumes — display name, avatar URL, reply preview, all in one place. Rewriting
 * fields on that object is the same category of work as Show Tag, which is the one render-
 * adjacent patch in this repo with no crash history. The alternative,
 * walking and rewriting the React tree for every message header, is
 * both far riskier and unnecessary for this surface.
 *
 * Inline @mentions and the member list go through `patches/displayName.ts`. The DM channel
 * header is `patches/dmHeader.ts`.
 */

let dumped = false

/**
 * One-shot dump of a generated row's shape, so the avatar field can be identified on device
 * rather than guessed. Logs key names and whether each value looks like a CDN URL — never the
 * values themselves, since those are the very strings this plugin exists to keep out of sight.
 */
function dumpRowShape(generated: any) {
	if (dumped) return
	dumped = true

	try {
		const shape = Object.keys(generated).map(key => {
			const value = (generated as any)[key]
			const kind = value === null ? 'null' : typeof value
			const cdn =
				typeof value === 'string' && value.includes('cdn.discordapp.com')
			return `${key}:${kind}${cdn ? '(cdn)' : ''}`
		})
		if (DEBUG)
			console.log('[ScreenshotRedactor] generated row shape:', shape.join(' '))
	} catch (error) {
		reportError('[ScreenshotRedactor] row dump failed:', error)
	}
}

/**
 * Patches one RowManager class.
 *
 * `pendingRow` lives in this closure rather than at module scope so that two different
 * RowManager classes — which is the whole reason `max` is raised below — can never read each
 * other's stashed row if one ever generates a row while the other is mid-call.
 */
/**
 * A runaway stack means `after` stopped firing for some calls (an exception thrown further down
 * the hook chain, say). Clearing beats growing without bound, and beats pairing rows with the
 * wrong call forever after.
 */
const MAX_DEPTH = 32

function patchOne(RowManager: any, cleanups: Array<() => void>) {
	const { HookPriority } = patcher as any
	// The shared name/avatar hooks must not bake aliases into the producer's caches or the
	// saved "original". Scope only the producer; our after-hook runs outside it and redacts
	// a private result. A finally block restores resolver behavior even if generation throws.
	cleanups.push(preserveOriginalResolution(RowManager.prototype, 'generate'))

	// Deliberately NOT `instead`: custom-timestamps already owns the one permitted `instead` on
	// this method, and a second one can infinitely recurse in this patcher. before/after are
	// plain linked lists and chain safely. See docs/coding-rules.md rule 2.
	//
	// `after` receives only the return value, so the row itself is stashed by `before` and
	// consumed there.
	//
	// A STACK, not the single slot this used to have (and that show-tag still has). The original
	// suspicion -- that `generate` re-enters itself for reply previews, letting an inner call
	// consume the slot -- was NOT borne out: device runs consistently report a maximum depth of
	// 1. The rows that looked lost turned out to be non-message rows with a non-numeric
	// `rowType`, which the counter split now separates properly.
	//
	// The stack stays because it is correct at any depth and costs nothing, and because "no row
	// at all" is now counted on its own (`skippedNoRow`) rather than hiding inside the row-type
	// skips, where it went unnoticed for four releases.
	const stack: any[] = []

	cleanups.push(
		before(RowManager.prototype, 'generate', (args: any[]) => {
			if (stack.length >= MAX_DEPTH) stack.length = 0
			stack.push(args?.[0])
			noteDepth(stack.length)
			// A before-hook must return the args array -- returning nothing sets args to
			// undefined for every later hook on this method, which is how Custom Timestamps
			// once took down the whole ChatView. See docs/coding-rules.md rule 2.
			return args
		}),
	)

	cleanups.push(
		after(
			RowManager.prototype,
			'generate',
			(ret: any) => {
				const row = stack.pop()

				// Every path returns `ret`. This is the chat render path: an exception or a
				// missing return here takes down the entire message list.
				try {
					// Chat is rendering, so React Native is unambiguously up by now -- which is
					// not true at start(), where the native module lookup comes back empty. After
					// it succeeds this is a single boolean read.
					ensureChatManagerPatched()
					ensureDmHeaderPatched()

					count('rowsSeen')
					noteRowType(row?.rowType)

					if (!isEnabled()) {
						// This row arrives unredacted, so it *is* the original now; a stored copy
						// could only be older (an edit since) and must not be restored over it.
						forgetOriginal(ret?.message?.id)
						count('skippedDisabled')
						return ret
					}
					// Split from skippedRowType on purpose: "no row at all" is a pairing bug in
					// this plugin, "row with a different type" is a genuine non-message row.
					// Counting them together is what hid the missed rows in the first place.
					if (row == null) {
						count('skippedNoRow')
						return ret
					}
					if (row.rowType !== 1 && !ret?.message) {
						count('skippedRowType')
						// A divider or date separator being skipped is correct. A skipped row
						// that carries an author is a leak, and the two were indistinguishable
						// in every dump so far.
						if (row.message?.author?.id) noteSkippedRowTypeWithAuthor()
						return ret
					}

					const generated = ret?.message
					if (!generated) {
						count('skippedNoMessage')
						return ret
					}

					const { verboseLogging } = settings()

					if (verboseLogging) dumpRowShape(generated)

					if (!generated.authorId) count('skippedNoAuthor')

					// Shared with the `updateRows` hook rather than reimplemented here: both
					// rewrite the same `Message` shape, and the two drifting apart is how the
					// reply preview ended up with its own slightly different avatar clearing.
					// The mirror needs the unredacted row to switch back to; see lib/originals.ts.
					rememberOriginal(generated)
					const outgoing = { ...generated }
					const changed = redactMessage(outgoing, redactOptions())

					if (changed) count('rowsRedacted')
					else count('skippedSelf')
					return { ...ret, message: outgoing }
				} catch (error) {
					reportError('[ScreenshotRedactor] generate hook failed:', error)
				}

				return ret
			},
			// Show Tag *appends* the real @handle to the same field this hook overwrites, so
			// whichever runs last wins. LOWEST is the intent ("run after everyone else");
			// whether the patcher orders the after-chain that way is unverified on device --
			// see the README's open questions. If Show Tag re-reveals handles while both are
			// on, flip this to HIGHEST.
			{ priority: HookPriority?.LOWEST ?? -1000 },
		),
	)

	countRowManager()
}

// getModules, not lookupModule: RowManager is chat UI and may not be initialized yet even from
// start() on a cold launch -- lookupModule would give up and permanently cache the miss.
// See docs/coding-rules.md rule 3.
export default function patchRowManager(): () => void {
	const { getModules } = finders
	const { withName } = filters

	const cleanups: Array<() => void> = []
	// Two module entries can resolve to the same class; patching its prototype twice would
	// install two redundant hook pairs.
	const seen = new Set<any>()

	const unsubscribe = getModules(
		withName('RowManager'),
		(RowManager: any) => {
			if (!RowManager?.prototype?.generate) {
				reportError(
					'[ScreenshotRedactor] RowManager.prototype.generate not found',
				)
				return
			}
			if (seen.has(RowManager.prototype)) return
			seen.add(RowManager.prototype)

			try {
				patchOne(RowManager, cleanups)
			} catch (error) {
				reportError('[ScreenshotRedactor] failed to patch a RowManager:', error)
			}
		},
		// `max` defaults to 1, so the plain call patches only the *first* RowManager and stops.
		// That is the leading suspect for redaction working in guild chat but not DMs: if the
		// build ships more than one of these, whichever loads second is never hooked. Raised to
		// match the precedent set by staff-tags' UserRow lookup, which hit the same default.
		{ max: 10 },
	)

	return () => {
		unsubscribe()
		cleanups.reverse().forEach(unpatch => {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		})
	}
}
