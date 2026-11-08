import type { GhostLogSettings } from "./types";

/**
 * Storage locations.
 *
 * A RELATIVE path resolves against the app's private storage dir on the native side; an ABSOLUTE
 * one is used as given. The default is relative, and therefore always writable.
 *
 * The old default was the absolute shared path below. Discord's manifest declares neither
 * MANAGE_EXTERNAL_STORAGE nor requestLegacyExternalStorage, so from Android 11 on there is no
 * permission to request and no dialog to raise -- the app simply cannot create files there through
 * the file API. Every catch then threw out of the native handler. Users already configured on the
 * shared path keep it (native probes it, and falls back with a reason the UI shows) because on
 * older or vendor-lenient devices it does still work and it survives an uninstall.
 *
 * The replacement for that portability is the .zip bundle: export writes the whole encrypted log,
 * shards and media as one archive that imports on any device running this plugin.
 *
 * NG owns the `GhostLogNG/` folder, NOT the old plugin's `GhostLog/`: both defaults pointing at one
 * shared-storage folder would mean each plugin re-encrypting the other's files under its own key,
 * and neither could read the result. NG reads old data only through import (GhostLogNG.kt keys).
 */
export const DEFAULT_BACKUP_PATH = "GhostLogNG/deleted-log.backup.json";
export const SHARED_BACKUP_PATH =
	"/storage/emulated/0/Download/GhostLogNG/deleted-log.backup.json";
export const DEFAULT_BUNDLE_PATH = "GhostLogNG/ghost-log-bundle.zip";
export const SHARED_BUNDLE_PATH =
	"/storage/emulated/0/Download/GhostLogNG/ghost-log-bundle.zip";

// Parity with Ghost Log: own messages are NOT caught unless the user opts in (Options),
// deleted messages stay visible with a red overlay, log capped at 100, encrypted backup on.
export const DEFAULTS: GhostLogSettings = {
	countOwnMessages: false,
	logDeletions: true,
	toastOnCatch: false,
	deleteStyle: "overlay",
	maxEntries: 100,
	unlimitedEntries: false,
	autoBackupEnabled: true,
	backupFilePath: DEFAULT_BACKUP_PATH,
	saveEmbeds: true,
	embedsPerFile: 100,
	ignoreBots: false,
	// On, like logging deletions: this is a message logger, and an edit is the other way a message
	// changes under you.
	logEdits: true,
	// Off, like own deletions: the point is what other people change. But seeing your own history is
	// an everyday want rather than a test, so it is a real setting and not the Debug page's switch.
	logOwnEdits: false,
	showEditHistory: true,
	warningDismissed: false,
	tapToJump: false,
	removeFromChat: false,
};
