/**
 * The in-chat look of a deleted message: the red overlay / "deleted" text tag, and the muted
 * edit-history lines above an edited message. Also locates the message record builder that
 * render-restore consumes.
 *
 * The hook targets are proven on the current build: `withName('RowManager')` (verified
 * structurally in the callback) with one wrapper per class (shared/wrapMethod) -- the old before/after pair
 * needed a LIFO stack to hand the row from before() to after(); a wrapper closes over its own
 * args, so nested generate() calls cannot mis-pair. The row descriptor is patched in place, exactly
 * like the proven hook: it is a fresh plain object per generate call, never shared state, and the
 * parse-cache rule still holds -- edit history assigns a NEW content array; the cached nodes are
 * never touched. (A copy-then-patch variant shipped in 0.1.1 and failed on-device; see the note in
 * patchRowManager.)
 */

import * as finders from "@valenced/modules/finders";
import * as filters from "@valenced/modules/finders/filters";
import * as ReactNative from "react-native";
import { reportError } from "../../../../shared/report";
import { wrapMethod } from "../../../../shared/wrapMethod";
import type { GhostLogSettings } from "../types";
import { getEditRecord } from "./edits";
import { createPatchList, guarded } from "./finders";
import { isDeletedMessage, watchChannelMessages } from "./keep";
import { setCreateMessageRecord } from "./restore";
import { clipVersion } from "./sanitize";

const DEBUG: boolean = false;

const TAG = "[GhostLogNG:visuals]";

function patchRowManager(
	getSettings: () => GhostLogSettings,
	patches: ReturnType<typeof createPatchList>,
) {
	const { getModules } = finders;
	const { withName } = filters;

	// `withName('RowManager')` is what the old plugin used and it is proven on the current build
	// (350.2 -- names are not minified there). The callback still verifies the structure
	// (prototype.generate), so a renamed-but-identically-named wrong class cannot install a hook.
	// A structural-only filter (prototype.generate) turned out to be too loose: `generate` is a
	// common method name, the sweep spent the match budget on unrelated classes, and the real
	// RowManager never got patched (0.1.1 on-device). If Discord minifies names again (349.5 did),
	// this needs a path finder -- the Debug probes can recover the imported path.
	//
	// `max` defaults to 1, and the count is spent even when the callback bails out early -- so the
	// plain call patched only the FIRST RowManager and stopped. There is more than one RowManager
	// class in this app (screenshot-redactor raises max for exactly this reason), which meant
	// deleted-message styling silently never applied wherever a second one rendered. Two module
	// entries can also resolve to the same class, so dedupe by prototype or the hooks install twice.
	const seenRowManagers = new Set<any>();

	const unsub = getModules(
		withName("RowManager"),
		guarded(TAG, (RowManager: any) => {
			if (!RowManager?.prototype?.generate) {
				reportError(`${TAG} RowManager.prototype.generate not found`);
				return;
			}
			if (seenRowManagers.has(RowManager.prototype)) return;
			seenRowManagers.add(RowManager.prototype);

			// One `instead` wrapper instead of the old before/after pair (which needed a LIFO stack
			// because after() gets no args; here the args live in this closure, so nested generate()
			// calls cannot mis-pair). The row descriptor is patched IN PLACE, exactly like the proven
			// GLNB hook: it is a fresh plain object per generate call, never shared state, and the
			// parse-cache rule is still honoured (edit history assigns a NEW content array; the cached
			// nodes are never touched).
			//
			// wrapMethod, not the patcher's `instead`: Custom Timestamps also changes generate this
			// way and half the repo before/after-hooks it, which set off the two-instead recursion
			// (coding rule 2) as "Maximum call stack size exceeded" on the chat screen (352.2 testing).
			//
			// A plain `function`, NOT an arrow, and Reflect.apply(original, this, args), NOT
			// original(...args): generate is a prototype method, so it needs its receiver.
			// wrapMethod calls the hook with the receiver as `this`, like the patcher's instead
			// -- an arrow function discards it, and calling `original(...)` bare runs
			// generate with `this === undefined`. That surfaced as "TypeError: Cannot read property
			// 'options' of undefined" thrown from Discord's own code, several frames below ours
			// (0.1.2 on-device). Pattern from custom-timestamps/rowManager.ts, which shares this
			// method (docs/coding-rules.md documents the same).
			patches.push(
				wrapMethod(
					RowManager.prototype,
					"generate",
					function (this: any, args: any[], original: any) {
						// Confirmed on-device crash elsewhere (staff-tags): "undefined is not a function"
						// when the captured original wasn't actually a function yet at patch time.
						if (typeof original !== "function") return undefined;
						const ret: any = Reflect.apply(original, this, args);
						try {
							const data = args?.[0];
							if (data?.rowType !== 1) return ret;
							const settings = getSettings();

							try {
								if (settings.showEditHistory && data?.message?.id) {
									const record = getEditRecord(String(data.message.id));
									if (record?.versions?.length) {
										const content = ret?.message?.content;
										// content is Discord's per-record parse cache (docs: discord-row-content-
										// is-parse-cache) -- never edited in place: the row gets a new array that
										// holds the cached nodes after ours.
										if (Array.isArray(content)) {
											const trail = record.versions.map((version) => ({
												type: "subtext",
												content: [
													{
														type: "text",
														content: clipVersion(version.content),
													},
												],
											}));
											ret.message.content = [...trail, ...content];
										}
									}
								}
							} catch (error) {
								reportError(`${TAG} edit history row failed:`, error);
							}

							if (
								settings.deleteStyle === "off" ||
								!isDeletedMessage(data?.message)
							)
								return ret;

							if (settings.deleteStyle === "overlay") {
								ret.message = ret.message ?? {};
								ret.message.edited = "deleted";
								ret.backgroundHighlight = ret.backgroundHighlight ?? {};
								const { processColor } = ReactNative;
								if (processColor) {
									ret.backgroundHighlight.backgroundColor =
										processColor("#da373c22");
									ret.backgroundHighlight.gutterColor =
										processColor("#da373cff");
								}
							} else if (settings.deleteStyle === "text") {
								ret.message = ret.message ?? {};
								ret.message.edited = "deleted";
								if (ret.message.colorString === undefined) {
									ret.message.colorString = "#f04747";
								}
							}
						} catch (error) {
							reportError(`${TAG} RowManager hook failed:`, error);
						}
						return ret;
					},
				),
			);

			if (DEBUG)
				console.log(
					`${TAG} patched RowManager.generate (${seenRowManagers.size})`,
				);
		}),
		{ max: 10 },
	);

	return unsub;
}

/**
 * Finds Discord's message record builder for render-restore, which needs real MessageRecords
 * (methods, Date timestamps) rather than plain objects that crash the row builder.
 *
 * Nothing here is patched. createMessageRecord and updateMessageRecord used to be hooked to carry
 * the deleted flag through the fake MESSAGE_UPDATE; with deletes blocked instead, there is no fake
 * update to carry it through, and two hooks on the hottest path in the chat are gone.
 */
function findMessageRecordBuilder() {
	const { getModules } = finders;
	const { withProps } = filters;
	let found = false;
	const unsub = getModules(
		withProps("createMessageRecord", "updateMessageRecord"),
		guarded(TAG, (mod: any) => {
			if (found) return;
			const utils =
				typeof mod?.createMessageRecord === "function" ? mod : mod?.default;
			if (typeof utils?.createMessageRecord !== "function") return;
			found = true;
			setCreateMessageRecord(utils.createMessageRecord);
		}),
		{ max: 10 },
	);
	return unsub;
}

export function patchVisuals(getSettings: () => GhostLogSettings): () => void {
	// See createPatchList: a finder callback can land AFTER the plugin has been disabled, and a
	// hook pushed after teardown used to sit in the patches array forever, leaving a live hook on
	// the chat render path belonging to a plugin the user had switched off.
	const patches = createPatchList();

	const unsubs: (() => void)[] = [];
	for (const install of [
		() => patchRowManager(getSettings, patches),
		() => findMessageRecordBuilder(),
		() => watchChannelMessages(),
		// No hook on the MessageRecord class itself: once 0.5.0-beta14 made one install by wrapping
		// the constructor, message timestamps broke.
	]) {
		// One failing patch must not stop the others from installing, or skip cleanup for those
		// that did.
		try {
			unsubs.push(install());
		} catch (error) {
			reportError(`${TAG} visual patch failed to install:`, error);
		}
	}

	return () => {
		patches.dispose();
		for (const unsub of unsubs) {
			try {
				unsub();
			} catch (e) {
				/* ignore */
			}
		}
		// Messages kept this session stay in the store until the reload that stop() asks for; there is
		// nothing to undo here. (0.6.x re-dispatched a delete for each one, which only existed to undo
		// its own fake updates.)
	};
}
