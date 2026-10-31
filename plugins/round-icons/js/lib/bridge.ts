/**
 * What other plugins need to know about the shapes this one applies, published on `globalThis`
 * while the plugin runs (the way the Themes plugin published `__bleelblepThemes`):
 *
 * - `sendRound`: the send button is being drawn as a circle. Send Tweaks' swipe capsule grows out of
 *   the send button and copies its corner; it measures the button, but both plugins hook the same
 *   Discord component and Send Tweaks may measure before this plugin has rounded it. With this set
 *   it uses half the button's size instead.
 *
 * A getter, so the value follows the setting live.
 */

import { settings } from './settings'

export const BRIDGE_KEY = '__bleelblepSquares'

export function publishBridge(): () => void {
	const g = globalThis as any
	g[BRIDGE_KEY] = {
		version: 2,
		get sendRound(): boolean {
			return settings().chatButtons
		},
	}
	return () => {
		if (g[BRIDGE_KEY]?.version === 2) delete g[BRIDGE_KEY]
	}
}
