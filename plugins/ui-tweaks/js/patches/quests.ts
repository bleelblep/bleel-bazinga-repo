/**
 * Hides Quests: the quest bar on Home and DMs, the Quests button in the You tab, quest link embeds
 * in chat and the quest button in the activity panel. The Settings → Quests row goes through
 * lib/layout.ts (`QUEST_HOME`).
 *
 * Display only. Traced in the 352.2 bundle (hermes-dec), not yet confirmed on a device. The one
 * central gate, `modules/quests/lib/QuestsEligibility.tsx` `getIsEligibleForQuests`, is NOT
 * touched: its callers include the quest fetch (`QuestFetchManager`), so forcing it would change
 * network behaviour. Nothing here touches enrolment, progress or fetching (account-safety AS-06):
 * quests already started keep running exactly as Discord runs them.
 *
 * - Quest bar: `modules/quests/native/QuestHooks.native.tsx` `useIsMobileQuestDockRenderedBase`, read
 *   by the dock and by the You bar's layout. An `after` keeps the hook call (React's hook order)
 *   and answers false.
 * - You tab button: `modules/main_tabs_v2/native/tabs/you/YouBannerDecorations.tsx` builds its
 *   buttons (conjure, quests, shop, nitro, settings); the one keyed `quests` is taken out of the render.
 * - Embeds: `modules/quests/native/QuestEmbed.native.tsx` `createQuestsEmbed`, looked up per embed
 *   by `CodedLinks.tsx`, which already handles a null result.
 * - Activity panel: `modules/frames/panel/native/QuestActivityButton.tsx`, a memo; renders nothing.
 */

import { after, instead } from '@valenced/patcher'
import { wrapRender } from '../../../../shared/wrapRender'
import { findModule } from '../lib/find'
import { settings } from '../lib/state'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const TAG = '[UITweaks]'
const HOOKS = 'modules/quests/native/QuestHooks.native.tsx'
const YOU_BANNER = 'modules/main_tabs_v2/native/tabs/you/YouBannerDecorations.tsx'
const EMBED = 'modules/quests/native/QuestEmbed.native.tsx'
const ACTIVITY_BUTTON = 'modules/frames/panel/native/QuestActivityButton.tsx'

const on = () => settings().hideQuests

/** The object that owns [key] as a function: the namespace or its `default` (coding rule 3). */
function hostOf(mod: any, key: string): any {
	if (typeof mod?.[key] === 'function') return mod
	if (typeof mod?.default?.[key] === 'function') return mod.default
	return undefined
}

/** Removes elements keyed `quests` from [node]'s children, in place. Returns the count. */
function strip(node: any, depth = 0): number {
	if (!node || typeof node !== 'object' || depth > 20) return 0
	if (Array.isArray(node)) {
		let removed = 0
		for (let i = node.length - 1; i >= 0; i--) {
			if (node[i]?.key === 'quests') {
				node.splice(i, 1)
				removed++
			} else {
				removed += strip(node[i], depth + 1)
			}
		}
		return removed
	}
	return strip(node.props?.children, depth + 1)
}

export default (): (() => void) => {
	const undo: Array<() => void> = []

	undo.push(
		findModule(HOOKS, ['useIsMobileQuestDockRenderedBase'], (mod: any) => {
			const host = hostOf(mod, 'useIsMobileQuestDockRenderedBase')
			if (!host) return reportError(`${TAG} the quest bar hook isn't on this build`)
			undo.push(after(host, 'useIsMobileQuestDockRenderedBase', (shown: unknown) => (on() ? false : shown)))
		}),
	)

	undo.push(
		findModule(EMBED, ['createQuestsEmbed'], (mod: any) => {
			const host = hostOf(mod, 'createQuestsEmbed')
			if (!host) return reportError(`${TAG} the quest embed isn't on this build`)
			undo.push(
				instead(host, 'createQuestsEmbed', function (this: unknown, args: unknown[], original: (...a: unknown[]) => unknown) {
					if (on()) return null
					return Reflect.apply(original, this, args)
				}),
			)
		}),
	)

	undo.push(
		findModule(YOU_BANNER, null, (exports: any) => {
			let warned = false
			const filter = (tree: any) => {
				try {
					if (on() && !strip(tree) && !warned) {
						warned = true
						if (DEBUG) console.warn(`${TAG} no button keyed 'quests' in the You banner on this build`)
					}
				} catch (error) {
					reportError(`${TAG} hiding the You tab Quests button failed:`, error)
				}
				return tree
			}
			const restore = wrapRender(exports, original => function (this: unknown, ...args: any[]) {
				return filter(Reflect.apply(original, this, args))
			})
			if (restore) undo.push(restore)
			// A plain function component (no memo): JSX reads `default` at each render.
			else if (typeof exports?.default === 'function') undo.push(after(exports, 'default', filter))
			else reportError(`${TAG} the You banner has an unknown component shape`)
		}),
	)

	undo.push(
		findModule(ACTIVITY_BUTTON, null, (exports: any) => {
			const restore = wrapRender(exports, original => function (this: unknown, ...args: any[]) {
				if (on()) return null
				return Reflect.apply(original, this, args)
			})
			if (restore) undo.push(restore)
			else reportError(`${TAG} the activity panel quest button has an unknown component shape`)
		}),
	)

	return () => {
		for (const fn of undo.reverse()) {
			try {
				fn()
			} catch {
				/* already gone */
			}
		}
	}
}
