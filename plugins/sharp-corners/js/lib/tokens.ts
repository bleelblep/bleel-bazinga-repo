/**
 * Discord's corner tokens, all answering 0. The native hook (Corners.kt) already removes every
 * corner React Native draws; this is for shapes drawn without one: Skia and SVG (the You bar's
 * masked background reads YOU_BAR_BORDER_RADIUS in its worklets) and layout maths that adds a
 * corner to a padding. Every token table (`modules.mobile`, `modules.button`, ...) is swept by name,
 * so new corner tokens are covered without a list. `radii` (xs..round) is zeroed in place for
 * styles built after start, and put back on stop.
 */

import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'

/** A corner token by name; blur and shadow radii aren't corners. */
const CORNER = /RADIUS|CORNER/
const NOT_CORNER = /BLUR|SHADOW|ELEVATION|GLOW/

function tokensModule(): any {
	try {
		const { lookupModule } = finders
		const { withProps } = filters
		const found: any = lookupModule<any>(withProps('unsafe_rawColors', 'radii'))?.[0]
		return found?.modules ? found : found?.default
	} catch {
		return undefined
	}
}

/** Discord's raw palette (`unsafe_rawColors`), for drawing the square status dots. */
export function rawColors(): Record<string, string> | undefined {
	return tokensModule()?.unsafe_rawColors
}

/** How many corner tokens the last start covered, for the settings page. */
export let tokenCount = 0

/** Zeroes every corner token while `active()` says so. Returns a cleanup and how many it covered. */
export function sharpenTokens(active: () => boolean): { cleanup: () => void; count: number } {
	const cleanups: Array<() => void> = []
	const tokens = tokensModule()
	const groups = tokens?.modules ?? {}
	for (const group of Object.values<any>(groups)) {
		if (!group || typeof group !== 'object') continue
		for (const [name, token] of Object.entries<any>(group)) {
			if (!CORNER.test(name) || NOT_CORNER.test(name) || typeof token?.resolve !== 'function') continue
			try {
				cleanups.push(
					instead(token, 'resolve', (args: any[], original: any) => {
						const stock = original(...args)
						try {
							if (typeof stock === 'number' && active()) return 0
						} catch {
							/* stock */
						}
						return stock
					}),
				)
			} catch {
				/* frozen or odd token: skip */
			}
		}
	}

	tokenCount = cleanups.length

	const radii = tokens?.radii
	const saved: Record<string, number> = {}
	if (radii && typeof radii === 'object' && active()) {
		for (const [key, value] of Object.entries<any>(radii)) {
			if (typeof value !== 'number') continue
			try {
				radii[key] = 0
				saved[key] = value
			} catch {
				/* frozen */
			}
		}
	}

	return {
		count: cleanups.length,
		cleanup: () => {
			for (const cleanup of cleanups) cleanup()
			for (const [key, value] of Object.entries(saved)) {
				try {
					radii[key] = value
				} catch {
					/* frozen */
				}
			}
		},
	}
}
