import * as modulesFinders from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { reportError } from './report'

const DEBUG: boolean = false

/**
 * Finds a Discord module by the file path it reports to Discord's import tracker, with a name
 * filter as a fallback.
 *
 * Discord 349.5 minifies function names, so `withName('JumpToPresentButton')` and friends match
 * nothing there. Module paths (`components_native/chat/JumpToPresentButton.tsx`) are untouched,
 * and were identical in 348.5, so the path lookup covers both. The name filter still runs for
 * any build where the path differs; whichever matches first wins and the other is dropped.
 *
 * The callback always gets the module namespace (`{ default, ...named }`), the same shape as
 * `getModules(..., { returnNamespace: true })`. It runs at most once, inside a try, because
 * Revenge runs callbacks for already-initialized modules with no try around them (see
 * docs/debugging/api-contracts.md).
 */
export function getModuleByPath(
	path: string,
	fallback: unknown,
	callback: (mod: any) => void,
	tag = '[modules]',
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
		// Deferred: the path finder can call back before its own unsubscribe is returned.
		Promise.resolve().then(unsubscribeAll)
		try {
			callback(mod)
			if (DEBUG) console.log(`${tag} found ${path} (${via})`)
		} catch (error) {
			reportError(`${tag} patching ${path} failed:`, error)
		}
	}

	try {
		const finders = modulesFinders as any
		unsubs.push(finders.getModuleWithImportedPath(path, (mod: any) => run(mod, 'path')))
	} catch (error) {
		reportError(`${tag} path lookup for ${path} failed:`, error)
	}

	if (!done && fallback) {
		try {
			unsubs.push(
				getModules(fallback as any, (mod: any) => run(mod, 'name'), {
					returnNamespace: true,
				} as any),
			)
		} catch (error) {
			reportError(`${tag} name lookup for ${path} failed:`, error)
		}
	}

	return () => {
		done = true
		unsubscribeAll()
	}
}
