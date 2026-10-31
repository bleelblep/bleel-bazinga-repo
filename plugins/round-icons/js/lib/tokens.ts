/**
 * Overrides for Discord's design tokens. Some corners aren't in any style a render hook can see:
 * the You bar reads `YOU_BAR_BORDER_RADIUS` for the bar, its masked background and its animated
 * background's worklets (350.2 bundle, YouBar.tsx / YouBarBackground.tsx), and resolves it through
 * `token.resolve({ enabledExperiments, density })`: 28 with no experiments, 16 under the redesign's.
 * `instead` on `resolve` answers for every reader at once, live. The old plugin did the same for the
 * server frame's token (confirmed working on device).
 */

import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'

/** The token tables (`modules.*`: mobile, button, chat...), or undefined. Looked up at call time, never cached early. */
function tokenGroups(): any {
	try {
		const { lookupModule } = finders
		const { withProps } = filters
		const found: any = lookupModule<any>(withProps('unsafe_rawColors', 'radii'))?.[0]
		return found?.modules ?? found?.default?.modules
	} catch {
		return undefined
	}
}

/** `NAME` means `modules.mobile.NAME`; `group.NAME` any other table. */
function tokenNamed(name: string): any {
	const groups = tokenGroups()
	const dot = name.indexOf('.')
	return dot === -1 ? groups?.mobile?.[name] : groups?.[name.slice(0, dot)]?.[name.slice(dot + 1)]
}

function mobileTokens(): any {
	return tokenGroups()?.mobile
}

/**
 * The redesign's experiment flags. Every corner token resolves to its pre-redesign value without
 * them (read live on 351.3, 2026-10-18: CHAT_INPUT_BORDER_RADIUS 24 vs 8, TABLE_ROW_BORDER_RADIUS
 * 16 vs 12, button.BORDER_RADIUS round vs 8, GUILD_FOLDER_BACKGROUND_RADIUS round vs 16 ...).
 */
const REDESIGN_EXPERIMENTS = /^mobile-visual-refresh/

/**
 * Discord's "fully round" token value is 2147483647. Android draws a corner that big as NO corner
 * (seen on 351.3, 2026-10-19: the You tab's buttons and the message box came out square), so any
 * corner past this is capped to it. React Native clamps 9999 to half the view: a circle or a pill.
 */
export const MAX_CORNER = 9999
const capped = (value: unknown) => (typeof value === 'number' && value > MAX_CORNER ? MAX_CORNER : value)

/**
 * Makes the corner tokens in `names` answer as they did before the redesign while `active()` says
 * so: resolved with the redesign's experiment flags removed from the context, so sizes and spacing
 * (other tokens) stay as they are and only these corners change. Names the plugin can't find are
 * skipped and reported in the returned list. Returns a cleanup.
 */
export function stockCorners(names: string[], active: () => boolean): { cleanup: () => void; missing: string[] } {
	const cleanups: Array<() => void> = []
	const missing: string[] = []
	for (const name of names) {
		const token = tokenNamed(name)
		if (typeof token?.resolve !== 'function') {
			missing.push(name)
			continue
		}
		cleanups.push(
			instead(token, 'resolve', (args: any[], original: any) => {
				try {
					const context = args[0]
					if (active() && context && Array.isArray(context.enabledExperiments)) {
						return capped(original({ ...context, enabledExperiments: context.enabledExperiments.filter((e: unknown) => !REDESIGN_EXPERIMENTS.test(String(e))) }, ...args.slice(1)))
					}
				} catch {
					/* stock */
				}
				return active() ? capped(original(...args)) : original(...args)
			}),
		)
	}
	return { cleanup: () => cleanups.forEach(c => c()), missing }
}

/** Another mobile token's value in the same resolution context, or undefined. */
export function tokenValue(name: string, context: unknown): number | undefined {
	try {
		const value = mobileTokens()?.[name]?.resolve?.(context)
		return typeof value === 'number' ? value : undefined
	} catch {
		return undefined
	}
}

/**
 * Makes the corner tokens in `names` fully round (MAX_CORNER, which React Native clamps to a circle
 * or pill) while `active()` says so. Missing names are skipped and listed.
 */
export function roundCorners(names: string[], active: () => boolean): { cleanup: () => void; missing: string[] } {
	const cleanups: Array<() => void> = []
	const missing: string[] = []
	for (const name of names) {
		const token = tokenNamed(name)
		if (typeof token?.resolve !== 'function') {
			missing.push(name)
			continue
		}
		cleanups.push(
			instead(token, 'resolve', (args: any[], original: any) => {
				const stock = original(...args)
				try {
					if (active() && typeof stock === 'number') return MAX_CORNER
				} catch {
					/* stock */
				}
				return stock
			}),
		)
	}
	return { cleanup: () => cleanups.forEach(c => c()), missing }
}

/**
 * Makes `name` resolve to `value(original, context)` while `active()` says so; the original answer
 * otherwise. Throws if the token isn't on this build.
 */
export function overrideToken(name: string, active: () => boolean, value: (original: number, context: unknown) => number): () => void {
	const token = mobileTokens()?.[name]
	if (typeof token?.resolve !== 'function') throw new Error(`token ${name} not found`)
	return instead(token, 'resolve', (args: any[], original: any) => {
		const stock = original(...args)
		try {
			if (active() && typeof stock === 'number') return value(stock, args[0])
		} catch {
			/* stock */
		}
		return stock
	})
}
