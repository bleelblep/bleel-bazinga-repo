// Globals the Valenced host injects into an external plugin's scope.
//
// These mirror revenge-bundle-next's own `types/globals.consumers.ts` verbatim, and everything
// they reference comes from `types/next/` -- the *generated* type surface from that repo
// (`bun types` -> `dist/types`), vendored here. See types/next/README.md.
//
// This replaced a hand-written `types/revenge.d.ts` that had been reverse-engineered from built
// plugin output and corrected against crash logs. Several of its guesses were wrong
// (`revenge.discord.common.chroma`, `.moment`, `revenge.utils.react.findInReactTree`,
// `filters.withStoreName`), each found on-device rather than at compile time.

import type {
	PluginApi,
	PluginApiExtensionsOptions,
	PluginOptions,
	UnscopedPluginApi,
} from "@valenced/plugins/types"
import type { JsonStorage } from "@valenced/json-storage"

declare global {
	/** Defines an entrypoint for a Valenced JS plugin. */
	function plugin<O extends PluginApiExtensionsOptions>(options: PluginOptions<O>): PluginOptions<O>

	/**
	 * The unscoped plugin API.
	 *
	 * Upstream types this as `UnscopedPreInitPluginApi | UnscopedInitPluginApi | UnscopedPluginApi`,
	 * since what's actually populated depends on the lifecycle phase. Narrowed to the Start-phase
	 * type here because every read in this repo happens inside `start()` or a render function --
	 * which is mandatory anyway, for the reasons in docs/coding-rules.md rule 1.
	 */
	const valenced: UnscopedPluginApi

	/** Convenience aliases so plugin code doesn't repeat the extension-options generic. */
	type ValencedPluginStartApi<S extends object> = PluginApi<{ jsonStorage: S }>

	/**
	 * Note that `cache` and `use()` are both possibly-`undefined`, and that is not pedantry:
	 * `load: true` calls `get()` **without awaiting it** (`lib/json-storage/src/index.ts`), so
	 * there is a real window during which the storage hasn't loaded yet. Every read site in this
	 * repo falls back to that plugin's `DEFAULTS` rather than assuming a value.
	 */
	type ValencedJsonStorageApi<S extends object> = JsonStorage<S>
}

export {}
