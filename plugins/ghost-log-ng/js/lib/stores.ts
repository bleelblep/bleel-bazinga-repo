import { Stores } from "@valenced/discord/flux";

/**
 * The flux stores, lazily. Deliberately NOT a module-scope destructure: reading `valenced.discord.*`
 * at module scope breaks the whole Settings screen on some builds (the lazy-API poisoning rule in
 * docs/debugging/notes.md), and a store must be fetched at use time anyway -- stores may not be
 * loaded when a module first evaluates.
 */
export function getStores(): any {
	return Stores as any;
}
