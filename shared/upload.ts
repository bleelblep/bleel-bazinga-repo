/**
 * Putting a local image into the message box as an attachment, the way picking a photo does.
 * Shared by every plugin that attaches files (Sekai Stickers, Pocket Browser).
 *
 * Nothing is sent: the file waits above the message box, where it can be removed, captioned or sent
 * with the normal send button.
 *
 * ## Why not just call Discord's upload functions
 *
 * `actions/UploadAttachmentActionCreators.tsx` and `modules/media_keyboard/native/
 * MediaKeyboardUtils.tsx` load lazily: only once the photo picker has been opened. The plugins used
 * to load them themselves with Metro's `__r` by module IDs listed per Discord build, and every new
 * build broke that ("Discord's upload functions weren't found").
 *
 * What they do is small (350.4 bundle, read from the bytecode 2026-10-18):
 *
 * - `cropResultToUploadItem({ path, mime, width, height })` returns `{ id: uniqueId(path), uri,
 *   originalUri, mimeType, width, height, filename, platform: UploadPlatform.REACT_NATIVE }`, where
 *   `uri` and `originalUri` are the path with `file://` added and `filename` its last part.
 * - `addFile({ file, channelId, draftType, allowOptimization })` converts the image first if
 *   `itemNeedsImagePreConversion` (HEIC and the like; PNG, JPEG, GIF and WebP don't), then
 *   dispatches `{ type: 'UPLOAD_ATTACHMENT_ADD_FILES', channelId, files: [file], draftType,
 *   allowOptimization }` on the Flux dispatcher.
 * - `UploadPlatform.REACT_NATIVE` and `DraftType.ChannelMessage` are both 0.
 *
 * So Discord's own functions are used when Discord has loaded them -- that keeps Strip Metadata's
 * hook on `addFile` in the path -- and otherwise the item is built here and the same action is
 * dispatched directly. The dispatcher is always loaded, so this works on any build.
 *
 * Call only from functions: `valenced.*` is read lazily.
 */

import * as flux from '@valenced/discord/common/flux'
import * as modulesFinders from '@valenced/discord/utils/modules/finders'
import { getModuleByPath } from './modules'

const UPLOAD_ACTIONS = 'actions/UploadAttachmentActionCreators.tsx'
const MEDIA_KEYBOARD_UTILS = 'modules/media_keyboard/native/MediaKeyboardUtils.tsx'
const DRAFT_STORE = 'stores/DraftStore.tsx'
const UPLOAD_PLATFORM = 'modules/media_uploads/UploadPlatform.tsx'

/** The values in the 350.4 bundle, for when their modules aren't loaded. */
const CHANNEL_MESSAGE_DRAFT = 0
const REACT_NATIVE_PLATFORM = 0

/** A local image file to attach: a screenshot, a rendered sticker, a downloaded picture. */
export interface LocalImage {
	/** An absolute path, with or without `file://`. */
	path: string
	width: number
	height: number
	/** Defaults to image/png. */
	mime?: string
}

/** A module Discord has already loaded, by its source path; undefined until then. */
function loaded(path: string): any {
	try {
		// [] (truthy) for a module that exists but isn't loaded yet; [exports, id] once it is.
		return (modulesFinders as any).lookupModuleWithImportedPath(path)?.[0]
	} catch {
		return undefined
	}
}

let creators: any

/**
 * Picks up Discord's upload functions as soon as Discord loads them, so a plugin-attached file goes
 * through them (and any plugin wrapping them). Optional: attachImage works without it.
 */
export function watchUploads(tag = '[uploads]'): () => void {
	const undo = getModuleByPath(UPLOAD_ACTIONS, null, (mod: any) => {
		const found = mod?.default ?? mod
		if (typeof found?.addFile === 'function') creators = found
	}, tag)
	return () => {
		undo()
		creators = undefined
	}
}

let counter = 0

/** An upload item like cropResultToUploadItem's, from Discord's function when it's loaded. */
export function uploadItem(image: LocalImage): any {
	const mime = image.mime ?? 'image/png'
	const crop = { path: image.path.replace(/^file:\/\//, ''), mime, width: image.width, height: image.height }
	const utils = loaded(MEDIA_KEYBOARD_UTILS)
	if (typeof utils?.cropResultToUploadItem === 'function') {
		try {
			return utils.cropResultToUploadItem(crop)
		} catch {
			/* build it here instead */
		}
	}
	const uri = `file://${crop.path}`
	const platform = loaded(UPLOAD_PLATFORM)?.UploadPlatform?.REACT_NATIVE
	return {
		id: `${crop.path}${Date.now().toString(36)}${++counter}`,
		uri,
		originalUri: uri,
		mimeType: mime,
		width: image.width,
		height: image.height,
		filename: crop.path.split('/').pop() || 'image',
		platform: typeof platform === 'number' ? platform : REACT_NATIVE_PLATFORM,
	}
}

function channelMessageDraft(): unknown {
	const value = loaded(DRAFT_STORE)?.DraftType?.ChannelMessage
	return value !== undefined ? value : CHANNEL_MESSAGE_DRAFT
}

/** Queues [image] as an attachment in [channelId]'s message box. Throws if it can't. */
export function attachImage(image: LocalImage, channelId: string) {
	const file = uploadItem(image)
	const draftType = channelMessageDraft()

	const actions = creators ?? (loaded(UPLOAD_ACTIONS)?.default ?? loaded(UPLOAD_ACTIONS))
	if (typeof actions?.addFile === 'function') {
		creators = actions
		actions.addFile({ file, channelId, draftType })
		return
	}

	const dispatcher = (flux as any).Dispatcher
	if (typeof dispatcher?.dispatch !== 'function') throw new Error("Couldn't reach Discord to add the file.")
	dispatcher.dispatch({ type: 'UPLOAD_ATTACHMENT_ADD_FILES', channelId, files: [file], draftType, allowOptimization: undefined })
}
