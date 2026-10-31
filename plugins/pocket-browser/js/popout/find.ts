/**
 * Finds a Discord module on 350.4-era builds.
 *
 * The imported-path SUBSCRIPTION (`getModuleWithImportedPath`) stopped reporting modules that
 * initialized before it subscribed (verified live on 350.4 / Valenced 1.7.1 — every path finder
 * stayed silent while `lookupModuleWithImportedPath` answered). So: ask synchronously once, keep
 * the subscription for modules that initialize later, and keep a props filter as the last net
 * for builds where the path differs.
 */

import * as discordFinders from '@valenced/discord/utils/modules/finders'
import * as moduleFinders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const TAG = '[Pop Out Player]'

export function findModule(
	path: string,
	fallbackProps: string[] | null,
	callback: (mod: any) => void,
): () => void {
	let done = false
	const unsubs: Array<() => void> = []

	const unsubscribeAll = () => {
		for (const unsub of unsubs.splice(0)) {
			try {
				unsub()
			} catch {
				/* already gone */
			}
		}
	}

	const run = (mod: any, via: string) => {
		if (done || !mod) return
		done = true
		Promise.resolve().then(unsubscribeAll)
		try {
			// The sync lookup returns a wrapper `{0: namespace, 1: id}` on some builds.
			callback(mod?.['0'] ?? mod)
			if (DEBUG) console.log(`${TAG} found ${path} (${via})`)
		} catch (error) {
			reportError(`${TAG} patching ${path} failed:`, error)
		}
	}

	// 1. Synchronous, for modules already initialized (the common case once the chat is up).
	try {
		const finders = discordFinders as any
		if (typeof finders.lookupModuleWithImportedPath === 'function') {
			const mod = finders.lookupModuleWithImportedPath(path)
			// An empty array means "known path, not initialized yet": wait for the subscription.
			// Treating it as found (0.1.x-0.3.x) called back with nothing and never retried, so every
			// lazily loaded module (chat handlers, the media viewer) was silently never patched.
			const loaded = Array.isArray(mod) ? mod.length > 0 && mod[0] != null : mod != null
			if (loaded) run(mod, 'sync')
		}
	} catch (error) {
		reportError(`${TAG} sync lookup for ${path} failed:`, error)
	}

	// 2. The subscription, for modules that initialize later.
	if (!done) {
		try {
			const finders = discordFinders as any
			unsubs.push(finders.getModuleWithImportedPath(path, (mod: any) => run(mod, 'late path')))
		} catch (error) {
			reportError(`${TAG} path subscription for ${path} failed:`, error)
		}
	}

	// 3. Props filter, for builds where the path changed.
	if (!done && fallbackProps && fallbackProps.length) {
		try {
			const { getModules } = moduleFinders
			const { withProps } = filters
			unsubs.push(
				getModules(withProps(...(fallbackProps as [string, ...string[]])), (mod: any) => run(mod, 'props'), {
					returnNamespace: true,
				}),
			)
		} catch (error) {
			reportError(`${TAG} props lookup for ${path} failed:`, error)
		}
	}

	if (!done) { if (DEBUG) console.warn(`${TAG} ${path}: not loaded yet; waiting for the subscription`) }

	return () => {
		done = true
		unsubscribeAll()
	}
}
