/**
 * Round Corners: undoes the redesign's squares, one at a time, each behind its own switch.
 *
 * Ground-up rewrite (1.0.0): JS only. The old version stacked five layers (a native hook cutting
 * every server picture as it drew, native size heuristics across all of Discord, a token override,
 * two JS patches) that fought each other and guessed by size app-wide. Now there is one
 * mechanism: each target names its components by module path (lib/targets.ts), the component's
 * render output gets re-rounded by a rule scoped to that component (lib/rounder.ts, lib/hook.ts),
 * and the server list's selection frame gets its own `circle` prop back (patches/selectionFrame.ts).
 *
 * Patches go in at startup. The server list reads its components once when it mounts, so a change
 * applies to lists built afterwards; the settings page asks for a reload.
 */

import { setupChangelog } from '../../../shared/changelog'
import { reportError, setReporter } from '../../../shared/report'
import { CHANGELOG } from './changelog'
import { publishBridge } from './lib/bridge'
import { hookRender } from './lib/hook'
import { roundTree } from './lib/rounder'
import { DEFAULTS, setStorage, settings, type SquaresStorage } from './lib/settings'
import { TARGETS } from './lib/targets'
import patchSelectionFrame from './patches/selectionFrame'
import Settings from './ui/Settings'

const TAG = '[Round Corners]'

function installTargets(): () => void {
	const cleanups: Array<() => void> = []
	for (const target of TARGETS) {
		if (target.install) {
			try {
				cleanups.push(target.install())
			} catch (error) {
				reportError(`${TAG} ${target.label} extra patch failed:`, error)
			}
		}
		for (const component of target.components) {
			try {
				cleanups.push(
					hookRender(component.path, component.export ?? 'default', (tree, props) => {
						const s = settings()
						if (target.gate ? !target.gate(s) : !s[target.id]) return tree
						const extra = target.classify?.(tree, props)
						return roundTree(tree, target.rule, 0, 0, extra ? { ...props, ...extra } : props, Boolean(target.deep))
					}),
				)
			} catch (error) {
				reportError(`${TAG} ${target.label} (${component.path}) failed:`, error)
			}
		}
	}
	return () => {
		for (const cleanup of cleanups.reverse()) cleanup()
	}
}

export default plugin<{ jsonStorage: SquaresStorage }>({
	jsonStorage: { load: true, default: DEFAULTS },

	start(api) {
		setReporter(api.plugin)
		api.cleanup(() => setReporter(undefined))
		setStorage(api.jsonStorage)
		api.cleanup(() => setStorage(undefined))
		for (const [what, install] of [
			['changelog', () => setupChangelog(api, CHANGELOG)],
			['bridge', publishBridge],
			['selection frame', patchSelectionFrame],
			['targets', installTargets],
		] as const) {
			try {
				api.cleanup(install())
			} catch (error) {
				reportError(`${TAG} ${what} failed:`, error)
			}
		}
	},

	// Lists built with the patches in place keep their shapes until Discord restarts.
	stop(api) {
		api.plugin.requireReload()
	},

	SettingsComponent: Settings,
})
