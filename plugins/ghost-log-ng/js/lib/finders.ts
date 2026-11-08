/**
 * Module lookups and patch-list plumbing, shared by the chat-behaviour modules.
 *
 * The rules encoded here (each with its history in docs/debugging/notes.md):
 * - Path-first: Discord 349.5 minified function names; imported module paths survived, so
 *   `getModuleWithImportedPath` beats any name filter. The namespace is
 *   `valenced.discord.utils.modules.finders` -- the short `valenced.modules.finders` path throws and
 *   silently falls back to a full sweep.
 * - Filters for the fallback are structural (props or shape tests), never `withName`.
 * - The fallback sweep+subscribe uses its OWN `max` budget; `lookupModule` is avoided (its misses
 *   are cached for the session and its budget is shared across every caller in the app).
 * - Every install callback runs inside a try: for already-initialized modules Valenced calls the
 *   callback with no try around it, so a throwing callback is an app kill, not a disabled feature.
 * - Patch lists know whether teardown happened: a finder callback can land AFTER the plugin was
 *   disabled, and a hook pushed after teardown used to stay live on the chat render path forever.
 */

import { getModules } from "@valenced/modules/finders";
import { getModuleByPath } from "../../../../shared/modules";
import { reportError } from "../../../../shared/report";

export function guarded<A extends any[]>(
	tag: string,
	fn: (...args: A) => void,
) {
	return (...args: A) => {
		try {
			fn(...args);
		} catch (error) {
			reportError(
				`${tag} install failed; feature disabled for this session:`,
				error,
			);
		}
	};
}

export interface LookupSpec {
	/** Log tag for failures. */
	tag: string;
	/** Imported path, when one is known. Tried first; survives minification. */
	path?: string;
	/** Fallback filter (withProps(...) or a structural function). Must not be a name filter. */
	filter?: unknown;
	/** Own match budget for the fallback sweep+subscribe. */
	max?: number;
	/**
	 * Called for each accepted module namespace, inside a try. Return true to stop looking
	 * (one-shot lookups); leave undefined to keep accepting matches (multi-class lookups like
	 * RowManager, where the caller dedupes by prototype).
	 */
	install: (mod: any, via: string) => boolean | void;
}

/**
 * One module lookup: imported-path finder first, structural fallback sweep+subscribe second.
 * Returns an unsubscribe that also stops future callbacks.
 */
export function safeLookup(spec: LookupSpec): () => void {
	const { tag } = spec;
	let done = false;
	const unsubs: Array<() => void> = [];

	const unsubscribeAll = () => {
		for (const unsub of unsubs.splice(0)) {
			try {
				unsub();
			} catch {
				/* already gone */
			}
		}
	};

	const accept = (mod: any, via: string): void => {
		if (done) return;
		let stop = false;
		try {
			stop = spec.install(mod, via) === true;
		} catch (error) {
			reportError(`${tag} ${via} lookup failed:`, error);
			return;
		}
		if (stop) {
			done = true;
			// The finder can call back before its own unsubscribe is returned; defer the teardown.
			Promise.resolve().then(unsubscribeAll);
		}
	};

	if (spec.path) {
		unsubs.push(
			getModuleByPath(
				spec.path,
				spec.filter ?? null,
				(mod: any) => accept(mod, "path"),
				tag,
			),
		);
	} else if (spec.filter) {
		try {
			unsubs.push(
				getModules(spec.filter as any, (mod: any) => accept(mod, "filter"), {
					returnNamespace: true,
					max: spec.max ?? 1,
				}),
			);
		} catch (error) {
			reportError(`${tag} module lookup failed:`, error);
		}
	}

	return () => {
		done = true;
		unsubscribeAll();
	};
}

/**
 * A patch list that knows teardown happened: anything pushed after dispose() is unpatched
 * immediately instead of staying live on the chat render path. Use wherever finder callbacks
 * push patcher hooks.
 */
export function createPatchList() {
	let stopped = false;
	const applied: Array<() => void> = [];

	return {
		push(unpatch: () => void) {
			if (stopped) {
				try {
					unpatch();
				} catch {
					/* ignore */
				}
				return;
			}
			applied.push(unpatch);
		},
		dispose() {
			stopped = true;
			for (const unpatch of applied.splice(0)) {
				try {
					unpatch();
				} catch {
					/* ignore */
				}
			}
		},
	};
}
