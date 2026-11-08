// The Discord modules this plugin needs, looked up here directly. Upstream gets them from the
// kmmiio Library plugin (dev.kmmiio99o.lib); these are the same filters it uses
// (kmmiio-lib js/lib/http.ts and stores.ts), so nothing else needs installing.
//
// Resolved on first use, never at module scope: this file runs at preInit, before Discord's
// modules exist (coding rule 1). A lookup that misses is tried again on the next call.

import { Stores } from '@valenced/discord/flux'
import {
	lookupModuleWithImportedPath,
	waitForModuleWithImportedPath,
} from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import { withDependencies, withProps } from '@valenced/modules/finders/filters'

function moduleGetter(props: string[]): () => any {
	let cached: any
	return () => {
		if (cached) return cached
		try {
			cached = (lookupModule as any)((withProps as any)(...props), {
				returnNamespace: true,
			})?.[0]
		} catch {
			cached = undefined
		}
		return cached
	}
}

function storeGetter(name: string): () => any {
	return () => {
		try {
			return (Stores as any)[name]
		} catch {
			return undefined
		}
	}
}

const assetManagerByProps = moduleGetter(['getAssetIds', 'fetchAssetIds'])

/**
 * Discord's own album-art helper, `utils/ApplicationAssetUtils.tsx` (named exports
 * `fetchAssetIds` and `getAssetIds`). It turns a cover link into an `mp:external/…` image id,
 * sending the lookup with Discord's own login, so the plugin never handles one (account-safety
 * AS-01/AS-02).
 *
 * Discord only loads it for app embeds, so on most sessions it's never loaded. When neither the
 * path nor the props find it, it's found by its dependency list and loaded: 32, 5, the next
 * module, ?, 38, 3, ?, ?, ?, 2. That shape is the same in 352.2 and 352.6 and matched exactly
 * one module on 352.6 (checked over DevTools 2026-11-03), so loading it wakes nothing else.
 */
const ASSET_UTILS_PATH = 'utils/ApplicationAssetUtils.tsx'
let assetUtils: any
let triedLoading = false

function withFetch(mod: any): any {
	if (typeof mod?.fetchAssetIds === 'function') return mod
	if (typeof mod?.default?.fetchAssetIds === 'function') return mod.default
	return undefined
}

export function getAssetManager(): any {
	if (assetUtils) return assetUtils
	try {
		const [ns] = (lookupModuleWithImportedPath as any)(ASSET_UTILS_PATH) ?? []
		assetUtils = withFetch(ns)
	} catch {}
	if (!assetUtils) assetUtils = withFetch(assetManagerByProps())
	if (!assetUtils && !triedLoading) {
		// Once a session: a miss here is remembered by the finder anyway.
		triedLoading = true
		try {
			const { relative } = withDependencies as any
			const filter = (withProps as any)('fetchAssetIds', 'getAssetIds').and(
				(withDependencies as any)([
					32,
					5,
					relative(1),
					null,
					38,
					3,
					null,
					null,
					null,
					2,
				]),
			)
			const [ns] =
				(lookupModule as any)(filter, { returnNamespace: true }) ?? []
			assetUtils = withFetch(ns)
		} catch {}
	}
	return assetUtils
}

/** Keeps watching for the helper until Discord loads it. Returns the unsubscribe. */
export function watchAssetManager(): () => void {
	if (getAssetManager()) return () => {}
	try {
		return (waitForModuleWithImportedPath as any)(
			ASSET_UTILS_PATH,
			(ns: any) => {
				assetUtils ??= withFetch(ns)
			},
		)
	} catch {
		return () => {}
	}
}
export const primeActivityModule = moduleGetter(['SET_ACTIVITY'])
export const getSelfPresenceStore = storeGetter('SelfPresenceStore')
export const getUserStore = storeGetter('UserStore')
