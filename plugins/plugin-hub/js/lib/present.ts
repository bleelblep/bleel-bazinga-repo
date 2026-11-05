import { listInstalled } from './installed'
import type { Entry } from '../types'
import * as modulesNative from '@valenced/modules/native'
import * as React from 'react'
import { reportError } from '../../../../shared/report'

/**
 * Which plugin ids are installed, for spotting hub entries whose plugin is gone (uninstalled, or
 * renamed to a new id -- Touch Ripple became Screen Effects).
 *
 * The live registry answers at once, but only with Developer Mode on (`lib/installed.ts`). Without
 * it, Valenced's `valenced.plugins.list` native method -- the one Checkup uses -- answers
 * asynchronously and needs nothing switched on. Its answer is cached for the session and refreshed
 * whenever a page asks, so an uninstall shows up the next time the Hub or Manage page opens.
 */

let nativeIds: Set<string> | undefined
const listeners = new Set<() => void>()

export function refreshInstalledIds(): void {
	try {
		const native = (modulesNative as any).callNativeMethod
		Promise.resolve(native('valenced.plugins.list', []))
			.then((list: unknown) => {
				if (!Array.isArray(list)) return
				nativeIds = new Set(
					list
						.map((plugin: any) => plugin?.manifest?.id)
						.filter((id: unknown): id is string => typeof id === 'string'),
				)
				for (const listener of listeners) listener()
			})
			.catch((error: unknown) =>
				reportError('[PluginHub] could not list installed plugins:', error),
			)
	} catch (error) {
		reportError('[PluginHub] could not list installed plugins:', error)
	}
}

/** Installed ids, or undefined while nothing has answered yet. */
export function installedIds(): Set<string> | undefined {
	const live = listInstalled()
	if (live) return new Set(live.map(plugin => plugin.id))
	return nativeIds
}

/** Installed ids as a hook: re-renders when the native list arrives. Refreshes on mount. */
export function useInstalledIds(): Set<string> | undefined {
	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		listeners.add(bump)
		refreshInstalledIds()
		return () => {
			listeners.delete(bump)
		}
	}, [])
	return installedIds()
}

/** Hub entries whose plugin is not installed. Empty while that cannot be told yet. */
export function orphansOf(entries: Entry[], ids: Set<string> | undefined): Entry[] {
	if (!ids) return []
	return entries.filter(entry => !ids.has(entry.id))
}
