/**
 * Ghost Log NG entry point -- lifecycle only. Capture lives in lib/capture.ts, keep-on-screen in
 * lib/keep.ts, rendering in lib/visuals.ts and lib/restore.ts, action guards in
 * patches/blockGhostActions.ts, edit capture in lib/edits.ts. This file wires them together and
 * owns ordering, so a hook or ordering bug is fixed here rather than hunted across one 450-line
 * file.
 */

import * as flux from "@valenced/discord/flux";
import { Stores } from "@valenced/discord/flux";
import { setupChangelog } from "../../../shared/changelog";
import { reportError, setReporter } from "../../../shared/report";
import { CHANGELOG } from "./changelog";
import { DEFAULT_BACKUP_PATH, DEFAULTS } from "./defaults";
import { native } from "./lib/bridge";
import {
	cancelBackupTimer,
	handleDelete,
	resetCaptureState,
} from "./lib/capture";
import { handleEdit, refreshEdits, resetEditsState } from "./lib/edits";
import { installJumpBanner } from "./lib/jumpBanner";
import { resetKeepState, tryKeepOnScreen } from "./lib/keep";
import { resetMediaState } from "./lib/media";
import { installJump } from "./lib/navigate";
import { stopAllProbes } from "./lib/probe";
import { patchRenderRestore, resetRestoreState } from "./lib/restore";
import { resetRichContentState } from "./lib/richContent";
import { patchVisuals } from "./lib/visuals";
import patchBlockGhostActions from "./patches/blockGhostActions";
import patchChatSheet from "./patches/chatSheet";
import {
	getSettings,
	initSettings,
	loadSettings,
	stopSettings,
} from "./settings";
import type { GhostLogSettings } from "./types";
import Settings from "./ui/pages/Settings";
import { registerPages } from "./ui/routes";
import {
	flushPendingAdds,
	refreshLog,
	refreshStorageStatus,
	resetState,
} from "./ui/state";

const DEBUG: boolean = false;

const TAG = "[GhostLogNG]";

export default plugin<{ jsonStorage: GhostLogSettings }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(api.plugin);
		api.cleanup(() => setReporter(undefined));

		// Enabling a plugin mid-session leaves its hooks half-applied -- Discord modules it patches
		// may already be initialized and its settings routes are registered too late for the
		// settings screen. Ask for a reload instead of running in a state we cannot verify.
		if (api.plugin.startedLate) {
			api.plugin.requireReload();
			return;
		}

		if (DEBUG) console.log(`${TAG} JS started`);
		api.cleanup(initSettings(api.jsonStorage));

		// Point native at the portable base dir FIRST (awaited) so the log, rolling shards and media
		// all resolve to the backup location, THEN load the log and sync limits. Ordering matters:
		// refreshLog reads the native log, so it must run after setBaseDir switches the directory.
		async function bootstrap() {
			// jsonStorage's `load: true` only STARTS the disk read -- it does not finish before
			// start() runs. Pushing DEFAULTS to native is what made a mass delete lose entries in the
			// old plugin (DEFAULTS say maxEntries 100 / unlimitedEntries false, so trimLocked() capped
			// the log at 100 and dropped the rest of a purge mid-burst even though the user had
			// unlimited on). Await the load first; see settings.ts for the full story.
			await loadSettings();
			const cfg = getSettings();
			await native
				.setBaseDir(cfg.backupFilePath || DEFAULT_BACKUP_PATH)
				.catch(() => {});
			await native
				.setLimits(cfg.maxEntries, cfg.unlimitedEntries)
				.catch(() => {});
			// Read back where native actually ended up. The configured location may be unwritable with
			// no permission available to fix it, in which case native falls back to app-private storage
			// and this is what lets the UI say so instead of the plugin appearing to work and losing
			// everything.
			await refreshStorageStatus();
			void refreshLog();
			// Loaded at start rather than on first visit: the chat needs it to draw edit history.
			void refreshEdits();
		}
		bootstrap().catch((error) =>
			reportError(`${TAG} bootstrap failed:`, error),
		);

		try {
			api.cleanup(registerPages());
		} catch (error) {
			reportError(`${TAG} failed to register settings pages:`, error);
		}
		try {
			api.cleanup(setupChangelog(api, CHANGELOG, { latestOnly: true }));
		} catch (error) {
			reportError(`${TAG} failed to set up the changelog:`, error);
		}

		// A restored message is still an ordinary SENT message to the rest of the client, so
		// reply, react, edit, delete, pin, forward, thread and mark unread are offered on it, and each
		// would go out to an id the server has deleted (AS-05).
		try {
			api.cleanup(patchBlockGhostActions());
		} catch (error) {
			reportError(`${TAG} failed to guard deleted-message actions:`, error);
		}

		// One place for a single delete: log it, then decide whether it stays on screen. Kept messages
		// are held back by returning nothing, so no store ever removes them -- see lib/keep.ts for
		// why this replaced the fake MESSAGE_UPDATE. Anything that goes wrong lets the delete through:
		// the worst case is Discord's normal behaviour.
		const { onFluxEventDispatched } = flux;
		api.cleanup(
			onFluxEventDispatched("MESSAGE_DELETE", (payload: any) => {
				try {
					const channelId = String(
						payload?.channelId ?? payload?.channel_id ?? "",
					);
					const messageId = String(payload?.id ?? "");
					if (!channelId || !messageId) return payload;
					handleDelete(channelId, messageId);
					const message = (Stores.MessageStore as any)?.getMessage?.(
						channelId,
						messageId,
					);
					if (tryKeepOnScreen(payload, message)) return undefined;
				} catch (error) {
					reportError(`${TAG} MESSAGE_DELETE handler failed:`, error);
				}
				return payload;
			}),
			onFluxEventDispatched("MESSAGE_UPDATE", (payload: any) => {
				try {
					handleEdit(payload);
				} catch (error) {
					reportError(`${TAG} MESSAGE_UPDATE handler failed:`, error);
				}
				return payload;
			}),
			onFluxEventDispatched("MESSAGE_DELETE_BULK", (payload: any) => {
				try {
					for (const id of payload.ids ?? [])
						handleDelete(payload.channelId, id);
				} catch (error) {
					reportError(`${TAG} MESSAGE_DELETE_BULK handler failed:`, error);
				}
				return payload;
			}),
			cancelBackupTimer,
		);

		// Discord 343.11 may still be completing Metro module registration during the
		// AppRegistry startup turn. Defer the hooks until the next turn; a partial export
		// must disable the feature, never crash the host during launch.
		let cancelled = false;
		const timer = setTimeout(() => {
			if (cancelled) return;
			for (const [label, install] of [
				["visual patching", () => patchVisuals(getSettings)],
				["render restore", () => patchRenderRestore(getSettings)],
				["log navigation", () => installJump()],
				// Remove from chat menu (patches/chatSheet.tsx).
				["message sheet rows", () => patchChatSheet()],
				// Dormant unless Logging > Tap the notice to jump is on.
				["tap-to-jump notice", () => installJumpBanner()],
			] as const) {
				try {
					api.cleanup(install());
				} catch (error) {
					reportError(`${TAG} failed to start deferred ${label}:`, error);
				}
			}
		}, 0);
		api.cleanup(() => {
			cancelled = true;
			clearTimeout(timer);
		});

		// The Debug page's probes hang off module scope, so without this they survive a plugin
		// disable and keep a second before/after pair installed on MessageStore.getMessages.
		api.cleanup(stopAllProbes);
		// Fold any staged captures into the cache before teardown rather than dropping them.
		api.cleanup(flushPendingAdds);
	},

	stop(api) {
		api.plugin.requireReload();
		// The reload means these would never be observed in-session, but the next start must not
		// inherit a half-lived session's state either (module-scope state was the old plugin's
		// stop-unfriendliness; every module that keeps state exports a reset).
		resetCaptureState();
		resetKeepState();
		resetEditsState();
		resetRestoreState();
		resetRichContentState();
		resetMediaState();
		resetState();
		stopSettings();
		if (DEBUG) console.log(`${TAG} JS stopped`);
	},

	SettingsComponent: Settings,
});
