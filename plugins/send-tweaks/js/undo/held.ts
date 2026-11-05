/**
 * The pure half of holding a message: what a `sendMessage` call carries, whether it's worth
 * holding, what the bar says, and what Undo puts back. No timers and no Discord here, so
 * tests/held.test.ts runs it under Node.
 *
 * A held send keeps the *whole* call -- its receiver, every argument, and the function that was
 * there before ours -- so when the wait ends it's replayed exactly as Discord made it: stickers,
 * the reply reference, allowed mentions and attachments included (lib/holds.ts).
 */

export interface Held {
	id: number
	channelId: string
	/** The text, for putting back in the box. Empty for a sticker-only or file-only send. */
	content: string
	/** When it was held and when it really goes, as timestamps. */
	from: number
	at: number
	/** The reply this message was, if it was one. */
	reply?: { messageId: string; mention: boolean }
	/** Photos or files on it. Undo can't put those back in the box. */
	attachments: number
	/** Stickers on it. Undo can't put those back either. */
	stickers: number
}

export type Summary = Pick<
	Held,
	'channelId' | 'content' | 'reply' | 'attachments' | 'stickers'
>

/**
 * Reads what matters out of a `sendMessage` call. From the 351.3 bundle (Voice Files' notes):
 * `sendMessage(channelId, { content, tts, ... }, undefined, { attachmentsToUpload, stickerIds,
 * messageReference, allowedMentions, ... })`. The options object is searched for, not indexed,
 * since its slot has moved before and may again.
 */
export function summarise(args: any[]): Summary | undefined {
	const channelId = args?.[0]
	if (typeof channelId !== 'string') return undefined
	const message = args[1]
	const content = typeof message?.content === 'string' ? message.content : ''
	const options = args.find(
		(arg, i) => i >= 2 && arg && typeof arg === 'object' && !Array.isArray(arg),
	)
	const reference = options?.messageReference ?? message?.messageReference
	const replyId = reference?.message_id ?? reference?.messageId
	const allowed = options?.allowedMentions ?? message?.allowedMentions
	const reply =
		typeof replyId === 'string'
			? { messageId: replyId, mention: allowed?.replied_user !== false }
			: undefined
	const attachments = Array.isArray(options?.attachmentsToUpload)
		? options.attachmentsToUpload.length
		: 0
	const stickerList =
		options?.stickerIds ?? message?.stickerIds ?? message?.sticker_ids
	const stickers = Array.isArray(stickerList) ? stickerList.length : 0
	return { channelId, content, reply, attachments, stickers }
}

/** Whether there's anything Undo could give back. An empty send may as well go now. */
export function worthHolding(
	summary: Summary,
	holdAttachments: boolean,
): boolean {
	if (summary.attachments > 0 && !holdAttachments) return false
	return (
		summary.content.length > 0 ||
		summary.reply !== undefined ||
		summary.attachments > 0 ||
		summary.stickers > 0
	)
}

/** Whole seconds left, never below 1 while it's still held. */
export function secondsLeft(held: Held, now: number): number {
	return Math.max(1, Math.ceil((held.at - now) / 1000))
}

/** How much of the wait is left, 1 down to 0, for the line that drains under the bar. */
export function fractionLeft(held: Held, now: number): number {
	const total = held.at - held.from
	if (!(total > 0)) return 0
	return Math.max(0, Math.min(1, (held.at - now) / total))
}

/** A short line for the bar: what's waiting, beside the Undo button. */
export function barLabel(held: Held, count: number): string {
	const what = held.content
		? 'Sending'
		: held.stickers
			? 'Sending sticker'
			: held.attachments
				? 'Sending file'
				: 'Sending'
	return count > 1 ? `${what} · ${count} waiting` : `${what}…`
}

/**
 * The text that goes back in the box. Whatever's already typed there comes after the undone
 * message, on its own line, so a second Undo doesn't wipe out the first.
 */
export function mergeDraft(
	undone: string,
	existing: string | undefined,
): string {
	const rest = existing?.trim() ? existing : ''
	if (!undone) return rest
	if (!rest) return undone
	return `${undone}\n${rest}`
}

/** What the toast says after Undo, so the user knows what didn't come back. Nothing when it all did. */
export function undoNotice(
	held: Held,
	sameChat: boolean,
	where: string,
): string | undefined {
	const lost: string[] = []
	if (held.attachments > 0)
		lost.push(held.attachments === 1 ? 'the file' : 'the files')
	if (held.stickers > 0)
		lost.push(held.stickers === 1 ? 'the sticker' : 'the stickers')
	const back = sameChat
		? "It's back in the message box"
		: `It's back in the message box in ${where}`
	if (!lost.length) return sameChat ? undefined : `${back}.`
	return `${back}. Add ${lost.join(' and ')} again.`
}

/** The upload objects a send carried (`attachmentsToUpload`), for putting back in the tray. */
export function uploadsOf(args: any[]): any[] {
	const options = args?.find(
		(arg, i) => i >= 2 && arg && typeof arg === 'object' && !Array.isArray(arg),
	)
	const list = options?.attachmentsToUpload
	return Array.isArray(list) ? list.filter(u => u && typeof u === 'object') : []
}

/**
 * The picker item a `CloudUpload` was made from, as `UPLOAD_ATTACHMENT_ADD_FILES` wants it:
 * `{ id, uri, originalUri, mimeType, filename, platform, width, height }`. The upload keeps the
 * item it was built from on `item`; failing that, the same fields live on the upload itself.
 */
export function uploadItem(upload: any): Record<string, unknown> | undefined {
	const source =
		upload?.item && typeof upload.item === 'object' ? upload.item : upload
	const uri = source?.uri ?? source?.originalUri
	if (typeof uri !== 'string') return undefined
	const item: Record<string, unknown> = {
		uri,
		originalUri:
			typeof source.originalUri === 'string' ? source.originalUri : uri,
	}
	for (const key of [
		'id',
		'mimeType',
		'filename',
		'platform',
		'width',
		'height',
		'durationSecs',
		'waveform',
		'isThumbnail',
	] as const) {
		if (source[key] !== undefined && source[key] !== null)
			item[key] = source[key]
	}
	return item
}
