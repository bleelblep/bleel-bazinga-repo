/**
 * What a page asks of the user, answered on the JS side with Discord's own pieces.
 *
 * - **Files** (`<input type="file">`): Discord ships `@react-native-documents/picker` as the
 *   `RNDocumentPicker` TurboModule (its attachment picker). `pick()` opens the system document
 *   picker from Discord's activity and resolves with `content://` URIs Discord may read; the
 *   WebView runs in the same process, so it can read them too. Plugin code can't receive an
 *   activity result itself, which is why native hands this to JS.
 * - **Camera and microphone**: the user is asked in Discord's alert dialog, then Android's own
 *   permission (React Native's `PermissionsAndroid`; Discord declares both for calls).
 *
 * Read from the 349.5 decompile (`com/reactnativedocumentpicker/RNDocumentPickerModule.java`,
 * options parsed in `ol/f.java`): `mode` 'open' | 'import', `type` MIME types, `allowMultiSelection`.
 */

import { filesChosen, permissionResult } from './native'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'
import { showToast } from '../../../../shared/toast'

const TAG = '[Pocket Browser]'

/** File extensions a page may list in `accept`, as MIME types the picker understands. */
const EXTENSIONS: Record<string, string> = {
	'.pdf': 'application/pdf',
	'.txt': 'text/plain',
	'.csv': 'text/csv',
	'.json': 'application/json',
	'.zip': 'application/zip',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.mp3': 'audio/mpeg',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.doc': 'application/msword',
	'.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

/** A page's `accept` list as MIME types. Anything unknown means any file, rather than none. */
export function mimeTypes(accept: string[]): string[] {
	const out = new Set<string>()
	for (const raw of accept) {
		const item = raw.trim().toLowerCase()
		if (!item) continue
		if (item.includes('/')) out.add(item)
		else if (EXTENSIONS[item]) out.add(EXTENSIONS[item])
		else return ['*/*']
	}
	return out.size ? [...out] : ['*/*']
}

function documentPicker(): any {
	const rn = ReactNative as any
	try {
		return rn.TurboModuleRegistry?.get?.('RNDocumentPicker') ?? rn.NativeModules?.RNDocumentPicker
	} catch {
		return rn.NativeModules?.RNDocumentPicker
	}
}

export function chooseFiles(json: string) {
	let accept: string[] = []
	let multiple = false
	try {
		const request = JSON.parse(json)
		accept = Array.isArray(request.accept) ? request.accept.filter((x: unknown) => typeof x === 'string') : []
		multiple = request.multiple === true
	} catch {
		/* a malformed request still gets a picker for any file */
	}
	const picker = documentPicker()
	if (typeof picker?.pick !== 'function') {
		showToast("Couldn't open the file picker on this Discord version.", 'PocketBrowserToast')
		filesChosen([])
		return
	}
	Promise.resolve(
		picker.pick({
			mode: 'open',
			type: mimeTypes(accept),
			allowMultiSelection: multiple,
			requestLongTermAccess: false,
			allowVirtualFiles: false,
			localOnly: false,
		}),
	)
		.then((files: any) => {
			const list = Array.isArray(files) ? files : [files]
			filesChosen(list.map((file: any) => file?.uri).filter((uri: unknown): uri is string => typeof uri === 'string'))
		})
		.catch((error: any) => {
			filesChosen([])
			// Backing out of the picker rejects with a cancel code; that's not an error.
			const code = String(error?.code ?? '')
			if (!/cancel/i.test(code) && !/cancel/i.test(String(error?.message ?? ''))) {
				reportError(`${TAG} file picker failed:`, error)
			}
		})
}

/** Android's runtime permission for each resource; null if Discord can't ask for it. */
async function androidAllows(camera: boolean, microphone: boolean): Promise<boolean> {
	const { PermissionsAndroid } = ReactNative as any
	if (!PermissionsAndroid?.requestMultiple) return false
	const wanted = [
		camera && PermissionsAndroid.PERMISSIONS.CAMERA,
		microphone && PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
	].filter(Boolean)
	const result = await PermissionsAndroid.requestMultiple(wanted)
	return wanted.every(permission => result?.[permission] === PermissionsAndroid.RESULTS.GRANTED)
}

function siteName(origin: string): string {
	return origin.replace(/^https?:\/\//i, '').replace(/\/$/, '') || 'This site'
}

export function askPermission(json: string) {
	let request: { id: string; origin: string; camera: boolean; microphone: boolean }
	try {
		request = JSON.parse(json)
		if (typeof request?.id !== 'string') return
	} catch {
		return
	}
	const { id, origin, camera, microphone } = request
	const what = camera && microphone ? 'your camera and microphone' : camera ? 'your camera' : 'your microphone'
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators
	const key = `PocketBrowserPermission-${id}`
	let answered = false
	const answer = (allow: boolean) => {
		if (answered) return
		answered = true
		alerts.dismissAlert(key)
		if (!allow) {
			permissionResult(id, false)
			return
		}
		androidAllows(camera, microphone)
			.then(granted => {
				permissionResult(id, granted)
				if (!granted) showToast(`Discord isn't allowed to use ${what}. Turn it on in Android settings.`, 'PocketBrowserToast')
			})
			.catch(error => {
				permissionResult(id, false)
				reportError(`${TAG} permission request failed:`, error)
			})
	}
	alerts.openAlert(
		key,
		<AlertModal
			title={`Use ${what}?`}
			content={`${siteName(origin)} wants to use ${what}. Allowed until Discord closes.`}
			onDismiss={() => answer(false)}
			actions={
				<>
					<AlertActionButton text="Allow" variant="primary" onPress={() => answer(true)} />
					<AlertActionButton text="Don't allow" variant="secondary" onPress={() => answer(false)} />
				</>
			}
		/>,
	)
}
