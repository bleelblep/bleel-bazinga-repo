import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { exportedFunction, offerPermissionHelper } from './discord'
import type { PluginCleanupApi } from '@valenced/plugins/types'

/**
 * Finds Discord's permission helper: the function that works out another member's permissions in
 * a guild. Lower rank wins, and a better candidate that loads later replaces a worse one.
 *
 * 0. `computePermissionsForMember`, where a build has it.
 * 1. `computePermissions` on the module that also has `canEveryoneRole`: that pair is
 *    PermissionUtils, the helper itself.
 * 2. `computePermissions` on anything else, skipping Flux stores.
 *
 * The store check matters. `PermissionStore` has a `computePermissions` method too, and stores are
 * module exports, so a bare `withProps('computePermissions')` can match it first. Its method needs
 * its `this` and answers for the *current* user, not the member being tagged. 1.3.12 took only
 * the first plain match; when that is the store, the real helper is never offered, and on 352.6
 * every ADMIN/STAFF/MOD tag disappeared while OWNER (no permissions needed) kept working.
 */
export function watchPermissionHelper(cleanup: PluginCleanupApi) {
	cleanup(
		getModules(
			withProps<PermissionUtils>('computePermissionsForMember'),
			module =>
				offerPermissionHelper(
					exportedFunction(module, 'computePermissionsForMember'),
					0,
				),
		),
		getModules(
			withProps<PermissionUtils>('computePermissions', 'canEveryoneRole'),
			module =>
				offerPermissionHelper(
					exportedFunction(module, 'computePermissions'),
					1,
				),
		),
		// Several modules carry the name; look past the stores instead of stopping at the first.
		getModules(
			withProps<PermissionUtils>('computePermissions'),
			module => {
				if (!isFluxStore(module))
					offerPermissionHelper(
						exportedFunction(module, 'computePermissions'),
						2,
					)
			},
			{ max: 20 },
		),
	)
}

interface PermissionUtils {
	computePermissionsForMember?: unknown
	computePermissions?: unknown
	canEveryoneRole?: unknown
}

/** Flux stores, which all have `addChangeListener` (on the store or its `default`). */
export function isFluxStore(exports: unknown): boolean {
	return typeof exportedFunction(exports, 'addChangeListener') === 'function'
}
