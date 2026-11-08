/*
 * Android's file picker, through the document picker Discord itself ships
 * (@react-native-documents/picker, native module `RNDocumentPicker`, seen in 352.2:
 * com.reactnativedocumentpicker.RNDocumentPickerModule). `pick` opens ACTION_OPEN_DOCUMENT and
 * resolves with the chosen files, each carrying a content:// `uri` that native reads through the
 * ContentResolver (importBundleUri / importBackupUri). No storage permission is involved: the user
 * picking the file is what grants access to it.
 *
 * Read while handling a tap, never at module scope (coding rule 1).
 */

import * as ReactNative from "react-native";
import { reportError } from "../../../../shared/report";

const TAG = "[GhostLogNG:picker]";

export interface PickedFile {
	uri: string;
	name?: string;
	size?: number;
}

function pickerModule(): any {
	const RN = ReactNative as any;
	try {
		return (
			RN.TurboModuleRegistry?.get?.("RNDocumentPicker") ??
			RN.NativeModules?.RNDocumentPicker
		);
	} catch {
		return RN.NativeModules?.RNDocumentPicker;
	}
}

/** Whether this Discord build has the picker at all. */
export function canPickFiles(): boolean {
	return typeof pickerModule()?.pick === "function";
}

/**
 * One file the user picks, or undefined if they back out or the picker is missing. `types` are MIME
 * types; Android's picker greys out the rest.
 */
export async function pickFile(
	types: string[] = ["*/*"],
): Promise<PickedFile | undefined> {
	const picker = pickerModule();
	if (typeof picker?.pick !== "function") return undefined;
	try {
		const result = await picker.pick({
			type: types,
			mode: "import",
			allowMultiSelection: false,
			requestLongTermAccess: false,
			allowVirtualFiles: false,
			localOnly: false,
		});
		const first = Array.isArray(result) ? result[0] : result;
		if (!first || typeof first.uri !== "string") return undefined;
		return {
			uri: first.uri,
			name: first.name ?? undefined,
			size: first.size ?? undefined,
		};
	} catch (error: any) {
		// Backing out of the picker rejects too; that isn't an error worth reporting.
		const code = String(error?.code ?? "");
		if (
			!/cancel/i.test(code) &&
			!/cancel/i.test(String(error?.message ?? ""))
		) {
			reportError(`${TAG} pick failed:`, error);
		}
		return undefined;
	}
}
