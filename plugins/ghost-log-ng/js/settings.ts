import * as react from "@valenced/react";
import { reportError } from "../../../shared/report";
import { DEFAULTS } from "./defaults";
import type { GhostLogSettings } from "./types";

/**
 * The ONE settings access path (docs/plugin-design-language.md settings rules; GLNB's history of
 * settings bugs in docs/debugging/notes.md).
 *
 * The old plugin read settings two ways -- `{ ...DEFAULTS, ...(storage?.use() ?? {}) }` ad hoc on
 * every page and `settingsStorage.cache` in the capture path -- which is how a jsonStorage load
 * race once pushed DEFAULT paths and a 100-entry cap at native and trimmed a merged log. Here every
 * consumer reads `getSettings()`/`useSettings()` and writes `setSettings()`; no module touches the
 * jsonStorage handle or spreads DEFAULTS itself, so there is exactly one place where a settings key
 * is named or defaulted.
 *
 * Startup order matters and is enforced in one place: `initSettings()` inside start(), then
 * `await loadSettings()` BEFORE native gets setBaseDir/setLimits pushed at it (load:true only
 * STARTS the disk read; it does not finish before start() runs).
 */

const TAG = "[GhostLogNG:settings]";

let storage: any;
let current: GhostLogSettings = { ...DEFAULTS };
const listeners = new Set<() => void>();

function notify() {
	for (const fn of listeners) fn();
}

let unsubscribeStorage: (() => void) | undefined;

/** The jsonStorage handle, once, in start(). Returns the teardown for api.cleanup. */
export function initSettings(handle: any): () => void {
	dropStorageSubscription();
	storage = handle;
	// The cache is per handle and other code can write the same document (the shared changelog
	// keeps `changelogSeenVersion` there). Mirror outside writes into the live copy when the
	// handle offers a subscription; otherwise this plugin is the only writer in-process.
	try {
		const unsubscribe = storage?.subscribe?.(() => {
			current = { ...DEFAULTS, ...(storage?.cache ?? {}) };
			notify();
		});
		if (typeof unsubscribe === "function") unsubscribeStorage = unsubscribe;
	} catch (error) {
		reportError(`${TAG} subscribe failed:`, error);
	}
	return stopSettings;
}

function dropStorageSubscription() {
	try {
		unsubscribeStorage?.();
	} catch (error) {
		reportError(`${TAG} unsubscribe failed:`, error);
	}
	unsubscribeStorage = undefined;
}

/** Drops the storage subscription and every settings listener (stop()). */
export function stopSettings() {
	dropStorageSubscription();
	listeners.clear();
}

/** The live settings. Always seeded with DEFAULTS, never undefined. */
export function getSettings(): GhostLogSettings {
	return current;
}

/** Await the on-disk load and fold it into the live copy. Called by the start() bootstrap. */
export async function loadSettings(): Promise<GhostLogSettings> {
	try {
		const loaded = await storage?.get();
		current = { ...DEFAULTS, ...(loaded ?? {}) };
	} catch (error) {
		reportError(`${TAG} load failed:`, error);
		current = { ...DEFAULTS };
	}
	notify();
	return current;
}

/** Write-through: the live copy updates immediately so patches and UI react in-session. */
export async function setSettings(
	patch: Partial<GhostLogSettings>,
): Promise<void> {
	Object.assign(current, patch);
	notify();
	try {
		await storage?.set(patch);
	} catch (error) {
		reportError(`${TAG} write failed:`, error);
	}
}

export function subscribeSettings(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/** React hook: the live settings, re-rendered on every change. */
export function useSettings(): GhostLogSettings {
	const { React } = react;
	const [settings, set] = React.useState<GhostLogSettings>(getSettings());
	React.useEffect(() => subscribeSettings(() => set(getSettings())), []);
	return settings;
}
