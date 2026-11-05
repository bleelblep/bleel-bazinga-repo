/**
 * Writing straight into the message box.
 *
 * Discord's `saveDraft` and a `DRAFT_CHANGE` dispatch update the draft store, but on 351.x the
 * box on screen doesn't follow them: after Undo the store had the text and the box stayed empty
 * (seen on device, 2026-10-27). The chat input's own handle does change what's on screen. It's
 * the `chatInputRef` Discord passes to the input's accessories, which this plugin already writes
 * through for Replace as you type (`lib/liveReplace.ts`):
 *
 * - `replaceRange({ location, length, text, editId })`, what the emoji suggestion bar uses.
 *   Natively it's dropped when `editId` no longer matches the box, so the state ref's `editId`
 *   goes with it.
 * - `insertText(text, location, ...)`, the older way.
 *
 * One chat input is on screen at a time, so the newest render's refs are kept here, with the
 * channel they were rendered for, and Undo writes through them only when that's the channel the
 * message came from. Another chat's text goes to the draft store instead and shows when that chat
 * is opened.
 */

type Handle = Record<string, any>
type Ref = { current?: Handle | null }

let composer:
	| { channelId: string | undefined; ref: Ref; stateRef: Ref | undefined }
	| undefined

/** Finds a ref Discord passes to the input's children, by prop name (as `lib/composer.ts`' `findRef`). */
export function findRef(node: any, prop: string, depth = 0): Ref | undefined {
	if (!node || typeof node !== 'object' || depth > 30) return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const ref = findRef(child, prop, depth + 1)
			if (ref) return ref
		}
		return undefined
	}
	const ref = node.props?.[prop]
	if (ref && typeof ref === 'object' && 'current' in ref) return ref
	return findRef(node.props?.children, prop, depth + 1)
}

/** Called on every chat input render, with the channel it was rendered for when known. */
export function rememberComposer(
	channelId: string | undefined,
	ref: Ref | undefined,
	stateRef: Ref | undefined,
) {
	if (!ref) return
	composer = { channelId, ref, stateRef }
}

export function forgetComposer() {
	composer = undefined
}

/** The channel the box on screen belongs to, when the render said. */
export function composerChannel(): string | undefined {
	return composer?.channelId
}

/**
 * Replaces everything in the box with [text]. True when a write went through; the box may still
 * refuse it (a stale edit id), which the caller can't see, so the draft store is written too.
 */
export function writeComposer(channelId: string, text: string): boolean {
	const handle = composer?.ref.current
	if (!handle || typeof handle !== 'object') return false
	if (composer?.channelId && composer.channelId !== channelId) return false
	let current = ''
	try {
		const now = handle.getText?.()
		if (typeof now === 'string') current = now
	} catch {
		/* unknown length: replace from 0 with length 0, which inserts at the start */
	}
	const editId = composer?.stateRef?.current?.editId ?? undefined
	try {
		if (typeof handle.replaceRange === 'function') {
			handle.replaceRange({ location: 0, length: current.length, text, editId })
			return true
		}
		if (typeof handle.insertText === 'function') {
			handle.insertText(text, 0, false, undefined, current.length)
			return true
		}
		if (typeof handle.setText === 'function') {
			handle.setText(text)
			return true
		}
	} catch {
		return false
	}
	return false
}
