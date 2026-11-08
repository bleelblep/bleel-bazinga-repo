import * as modulesNative from "@valenced/modules/native";

/**
 * JS -> native bridge, the ONE home for every native call.
 *
 * The old plugin scattered `${ID}.method` strings across eight modules and its type declaration
 * was missing repairMedia/mediaCheck entirely, so a typo was a runtime-only failure. Every call
 * here goes through a typed method on `native` and the `NativeMethods` declaration covers all 31
 * methods the Kotlin engine registers.
 *
 * The call itself goes through the global revenge API (not the `@valenced/modules/native`
 * import, which the main repo's JS-only bundler doesn't have); proven by native plugins like
 * chatbubbles. All calls return Promises; native reports operational failures as falsy results
 * (null/false/-1) rather than rejections, so callers must check the result, not just catch.
 */
export function callNativeMethod(name: string, args: any[]): Promise<any> {
	return (modulesNative as any).callNativeMethod(name, args);
}

const PREFIX = "bleelblep.ghost-log-ng";

export interface BackupResult {
	path: string;
	count: number;
	edits?: number;
	/** False when no recovery password covers it: it opens on this phone only. */
	portable?: boolean;
}

export interface ImportResult {
	added: number;
	edits: number;
}

/** importBackup's answer for a backup sealed on another phone or a previous install. */
export interface ImportPasswordResult {
	needsPassword?: boolean;
	wrongPassword?: boolean;
}

export interface UnlockResult {
	/** Key records the password opened; 0 means the password is wrong for every one. */
	matched: number;
	added: number;
	/** Still locked afterwards (the folder needs a key none of the records hold). */
	locked: boolean;
	entries: number;
}

export interface SetPasswordResult {
	ok: boolean;
	error?: string;
}

export interface OldPluginImportResult {
	found: boolean;
	added?: number;
	edits?: number;
	rich?: number;
	media?: number;
	sources?: number;
}

export interface BundleResult {
	path: string;
	files: number;
	count: number;
	portable?: boolean;
}

export interface DownloadsBundleResult {
	/** Where it landed, as the Files app shows it: Download/GhostLogNG/<name>.zip */
	path: string;
	count: number;
	portable?: boolean;
}

/** importBundle: needs the recovery password / the password does not open it. */
export const BUNDLE_NEEDS_PASSWORD = -2;
export const BUNDLE_WRONG_PASSWORD = -3;
/** importBundle: refused, the log is locked or unreadable (or native isn't set up yet). */
export const BUNDLE_REFUSED = -4;
/** importBundle: a file in the bundle didn't open or parse. */
export const BUNDLE_DAMAGED = -5;

/** Shortest recovery password native accepts (KeyRing.MIN_PASSWORD). */
export const MIN_RECOVERY_PASSWORD = 8;

export const native = {
	// Capture and log
	captureDeleted: (entry: Record<string, unknown>) =>
		callNativeMethod(`${PREFIX}.captureDeleted`, [entry]),
	getLog: () => callNativeMethod(`${PREFIX}.getLog`, []),
	getLogCount: () => callNativeMethod(`${PREFIX}.getLogCount`, []),
	getLogFilePath: () => callNativeMethod(`${PREFIX}.getLogFilePath`, []),
	clearLog: () => callNativeMethod(`${PREFIX}.clearLog`, []),
	removeEntry: (id: string) => callNativeMethod(`${PREFIX}.removeEntry`, [id]),
	removeEntries: (ids: string[]) =>
		callNativeMethod(`${PREFIX}.removeEntries`, [ids]),
	seedEntries: (entries: Record<string, unknown>[]) =>
		callNativeMethod(`${PREFIX}.seedEntries`, [entries]),
	// Rich content and media
	getRichContent: (ids: string[]) =>
		callNativeMethod(`${PREFIX}.getRichContent`, [ids]),
	getMedia: (name: string) => callNativeMethod(`${PREFIX}.getMedia`, [name]),
	getMediaThumb: (name: string) =>
		callNativeMethod(`${PREFIX}.getMediaThumb`, [name]),
	repairMedia: (name: string, url: string) =>
		callNativeMethod(`${PREFIX}.repairMedia`, [name, url]),
	mediaCheck: (name: string) =>
		callNativeMethod(`${PREFIX}.mediaCheck`, [name]),
	/** LocalVideoHook's state as JSON: hooked method count, files served, recent player opens. */
	getVideoStatus: () => callNativeMethod(`${PREFIX}.getVideoStatus`, []),
	// Edits
	captureEdit: (edit: Record<string, unknown>) =>
		callNativeMethod(`${PREFIX}.captureEdit`, [edit]),
	getEdits: () => callNativeMethod(`${PREFIX}.getEdits`, []),
	clearEdits: () => callNativeMethod(`${PREFIX}.clearEdits`, []),
	removeEdit: (id: string) => callNativeMethod(`${PREFIX}.removeEdit`, [id]),
	removeEdits: (ids: string[]) =>
		callNativeMethod(`${PREFIX}.removeEdits`, [ids]),
	// Storage
	setBaseDir: (backupPath: string) =>
		callNativeMethod(`${PREFIX}.setBaseDir`, [backupPath]),
	setLimits: (max: number, unlimited: boolean) =>
		callNativeMethod(`${PREFIX}.setLimits`, [max, unlimited]),
	getStorageStatus: () => callNativeMethod(`${PREFIX}.getStorageStatus`, []),
	// Backup and bundle
	exportBackup: (path: string) =>
		callNativeMethod(`${PREFIX}.exportBackup`, [path]),
	importBackup: (path: string, password?: string) =>
		callNativeMethod(
			`${PREFIX}.importBackup`,
			password ? [path, password] : [path],
		),
	exportBundle: (path: string) =>
		callNativeMethod(`${PREFIX}.exportBundle`, [path]),
	importBundle: (path: string, password?: string) =>
		callNativeMethod(
			`${PREFIX}.importBundle`,
			password ? [path, password] : [path],
		),
	importOldPlugin: () => callNativeMethod(`${PREFIX}.importOldPlugin`, []),
	// Files from Android's picker (content:// uris) and saving into the phone's Download folder.
	importBackupUri: (uri: string, password?: string) =>
		callNativeMethod(
			`${PREFIX}.importBackupUri`,
			password ? [uri, password] : [uri],
		),
	importBundleUri: (uri: string, password?: string) =>
		callNativeMethod(
			`${PREFIX}.importBundleUri`,
			password ? [uri, password] : [uri],
		),
	exportBundleToDownloads: () =>
		callNativeMethod(`${PREFIX}.exportBundleToDownloads`, []),
	// Encryption keys (KeyRing.kt). The password goes to native only; never log or store it.
	setRecoveryPassword: (password: string) =>
		callNativeMethod(`${PREFIX}.setRecoveryPassword`, [password]),
	unlock: (password: string) =>
		callNativeMethod(`${PREFIX}.unlock`, [password]),
	setAsideLocked: () => callNativeMethod(`${PREFIX}.setAsideLocked`, []),
};

declare module "@valenced/modules/native" {
	export interface NativeMethods {
		"bleelblep.ghost-log-ng.captureDeleted": [
			args: [entry: Record<string, unknown>],
			returnValue: string | boolean,
		];
		"bleelblep.ghost-log-ng.getLog": [args: any[], returnValue: string];
		"bleelblep.ghost-log-ng.getLogCount": [args: any[], returnValue: number];
		"bleelblep.ghost-log-ng.getLogFilePath": [args: any[], returnValue: string];
		"bleelblep.ghost-log-ng.clearLog": [args: any[], returnValue: boolean];
		"bleelblep.ghost-log-ng.removeEntry": [
			args: [id: string],
			returnValue: boolean,
		];
		"bleelblep.ghost-log-ng.removeEntries": [
			args: [ids: string[]],
			returnValue: number,
		];
		"bleelblep.ghost-log-ng.seedEntries": [
			args: [entries: Record<string, unknown>[]],
			returnValue: number,
		];
		"bleelblep.ghost-log-ng.getRichContent": [
			args: [ids: string[]],
			returnValue: string,
		];
		"bleelblep.ghost-log-ng.getMedia": [
			args: [name: string],
			returnValue: string | null,
		];
		"bleelblep.ghost-log-ng.getMediaThumb": [
			args: [name: string],
			returnValue: string | null,
		];
		"bleelblep.ghost-log-ng.repairMedia": [
			args: [name: string, url: string],
			returnValue: boolean,
		];
		"bleelblep.ghost-log-ng.mediaCheck": [
			args: [name: string],
			returnValue: string | null,
		];
		"bleelblep.ghost-log-ng.captureEdit": [
			args: [edit: Record<string, unknown>],
			returnValue: string | null,
		];
		"bleelblep.ghost-log-ng.getEdits": [args: any[], returnValue: string];
		"bleelblep.ghost-log-ng.clearEdits": [args: any[], returnValue: boolean];
		"bleelblep.ghost-log-ng.removeEdit": [
			args: [id: string],
			returnValue: boolean,
		];
		"bleelblep.ghost-log-ng.removeEdits": [
			args: [ids: string[]],
			returnValue: number,
		];
		"bleelblep.ghost-log-ng.setBaseDir": [
			args: [backupPath: string],
			returnValue: boolean,
		];
		"bleelblep.ghost-log-ng.setLimits": [
			args: [max: number, unlimited: boolean],
			returnValue: boolean,
		];
		"bleelblep.ghost-log-ng.getStorageStatus": [
			args: any[],
			returnValue: string,
		];
		"bleelblep.ghost-log-ng.exportBackup": [
			args: [path: string],
			returnValue: BackupResult | null,
		];
		"bleelblep.ghost-log-ng.importBackup": [
			args: [path: string, password?: string],
			returnValue: number | ImportResult | ImportPasswordResult,
		];
		"bleelblep.ghost-log-ng.exportBundle": [
			args: [path: string],
			returnValue: BundleResult | null,
		];
		"bleelblep.ghost-log-ng.importBundle": [
			args: [path: string, password?: string],
			returnValue: number,
		];
		"bleelblep.ghost-log-ng.importOldPlugin": [
			args: [],
			returnValue: OldPluginImportResult,
		];
		"bleelblep.ghost-log-ng.setRecoveryPassword": [
			args: [password: string],
			returnValue: SetPasswordResult | null,
		];
		"bleelblep.ghost-log-ng.unlock": [
			args: [password: string],
			returnValue: UnlockResult | null,
		];
		"bleelblep.ghost-log-ng.setAsideLocked": [
			args: [],
			returnValue: string | null,
		];
		"bleelblep.ghost-log-ng.importBackupUri": [
			args: [uri: string, password?: string],
			returnValue: number | ImportResult | ImportPasswordResult,
		];
		"bleelblep.ghost-log-ng.importBundleUri": [
			args: [uri: string, password?: string],
			returnValue: number,
		];
		"bleelblep.ghost-log-ng.exportBundleToDownloads": [
			args: [],
			returnValue: DownloadsBundleResult | null,
		];
	}
}
