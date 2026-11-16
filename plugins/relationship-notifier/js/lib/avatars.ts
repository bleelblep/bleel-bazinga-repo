/**
 * Keeps a copy of a friend's old and new avatar when it changes, so both can still be seen after
 * Discord stops serving the old one.
 *
 * Each picture is one anonymous download of a public image (AS-02): only `https://cdn.discordapp.com/
 * avatars/<id>/<hash>.png`, `credentials: 'omit'`, no Discord request helper, so no account is
 * attached. It's checked after the fact too: the final URL must still be on that host, the body must
 * be an image, and at most `MAX_BYTES`. Downloads run one at a time with a `TIMEOUT_MS` limit, and
 * whatever is still queued is dropped on stop (AS-07).
 *
 * Files go to Discord's documents folder through its own FileModule, under `relationship-notifier/
 * avatars/`, and are deleted when their history entry is (`forget`).
 */

import { FileModule } from '@valenced/discord/native'
import { reportError } from '../../../../shared/report'
import { TAG } from './tag'

const DEBUG: boolean = false

const HOST = 'https://cdn.discordapp.com/'
const DIR = 'relationship-notifier/avatars'
const MAX_BYTES = 512 * 1024
const TIMEOUT_MS = 15_000
const MAX_QUEUE = 20

const HASH = /^(a_)?[0-9a-f]{32}$/
const SNOWFLAKE = /^\d{5,25}$/

let queue: Promise<unknown> = Promise.resolve()
let queued = 0
let generation = 0

export function avatarUrl(userId: string, hash: string): string {
	return `${HOST}avatars/${userId}/${hash}.png?size=128`
}

/** `file://` URI for a saved copy, or undefined when the documents folder isn't known. */
export function fileUri(path: string): string | undefined {
	try {
		const dir = (FileModule as any)?.getConstants?.()?.DocumentsDirPath
		return typeof dir === 'string' && dir ? `file://${dir}/${path}` : undefined
	} catch {
		return undefined
	}
}

function toBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onerror = () => reject(reader.error ?? new Error('read failed'))
		reader.onload = () => {
			const url = String(reader.result ?? '')
			const comma = url.indexOf(',')
			if (comma < 0) reject(new Error('not a data URL'))
			else resolve(url.slice(comma + 1))
		}
		reader.readAsDataURL(blob)
	})
}

async function download(
	userId: string,
	hash: string,
	mine: number,
): Promise<string | undefined> {
	if (!SNOWFLAKE.test(userId) || !HASH.test(hash)) return undefined
	const url = avatarUrl(userId, hash)
	const abort =
		typeof AbortController === 'function' ? new AbortController() : undefined
	const timer = setTimeout(() => abort?.abort(), TIMEOUT_MS)
	try {
		const response = await fetch(url, {
			credentials: 'omit',
			signal: abort?.signal,
		})
		if (mine !== generation) return undefined
		// A 404 just means Discord no longer has that picture.
		if (!response.ok) return undefined
		if (response.url && !response.url.startsWith(HOST)) return undefined
		const type = response.headers.get('content-type') ?? ''
		if (!type.startsWith('image/')) return undefined
		const length = Number(response.headers.get('content-length') ?? 0)
		if (length > MAX_BYTES) return undefined
		const blob = await response.blob()
		if (blob.size > MAX_BYTES || mine !== generation) return undefined
		const data = await toBase64(blob)
		if (mine !== generation) return undefined
		const path = `${DIR}/${userId}-${hash}.png`
		await (FileModule as any).writeFile('documents', path, data, 'base64')
		if (DEBUG) console.log(`${TAG} saved ${path}`)
		return path
	} catch (error) {
		if (mine === generation && !(error as any)?.name?.includes?.('Abort'))
			reportError(`${TAG} saving an avatar failed:`, error)
		return undefined
	} finally {
		clearTimeout(timer)
	}
}

/**
 * Saves one avatar, after any already queued. Resolves to the saved path, or undefined when there
 * is nothing to save (default avatar), the queue is full, or the download didn't work.
 */
export function saveAvatar(
	userId: string,
	hash: string | undefined,
): Promise<string | undefined> {
	if (!hash || queued >= MAX_QUEUE) return Promise.resolve(undefined)
	const mine = generation
	queued++
	const job = queue.then(() =>
		mine === generation ? download(userId, hash, mine) : undefined,
	)
	queue = job
		.catch(() => undefined)
		.finally(() => {
			queued--
		})
	return job.catch(() => undefined)
}

/** Deletes saved copies. Missing files are fine. */
export function forget(paths: Array<string | undefined>) {
	for (const path of paths) {
		if (!path?.startsWith(`${DIR}/`)) continue
		try {
			;(FileModule as any)
				.removeFile?.('documents', path)
				?.catch?.(() => undefined)
		} catch {
			/* already gone */
		}
	}
}

/** Drops whatever hasn't started; a download in flight finishes without saving. */
export function cancelAvatars() {
	generation++
}
