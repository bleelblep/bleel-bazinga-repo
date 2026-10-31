/**
 * Turns a media viewer source into something the popout can play, or nothing.
 *
 * The viewer's sources (350.x `extractMediaFromAttachment` shape): `{ uri, width, height,
 * mediaIndex, filename, contentType, ... }`; a video adds `videoURI` (with `uri` its poster), a
 * YouTube embed's `uri` is the embed url that `MediaModalYoutube` reads its video id from. The
 * exact keys were read from the bundle, not a live source, so every candidate field is tried and
 * the first unrecognised source is logged once for checking.
 */

import type { PopoutRequest } from './player'

const DEBUG: boolean = false

const TAG = '[Pop Out Player]'
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i
let logged = false

/** The YouTube video id and start time in a watch, short or embed url. */
export function youtubeOf(url: string): { videoId: string; start?: number } | undefined {
	let match = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|watch\?(?:.*&)?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/)
	if (!match) return undefined
	const videoId = match[1]
	match = url.match(/[?&#](?:t|start)=(\d+)/)
	const start = match ? Number(match[1]) : undefined
	return { videoId, start }
}

function str(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function requestFor(source: any): PopoutRequest | undefined {
	if (!source || typeof source !== 'object') return undefined
	const uri = str(source.uri) ?? str(source.url)
	const candidates = [str(source.videoURI), str(source.sourceURI), uri, str(source.proxyURL), str(source.originalURL)].filter(Boolean) as string[]

	for (const url of candidates) {
		const youtube = youtubeOf(url)
		if (youtube) return { kind: 'youtube', url, ...youtube }
	}

	const video = str(source.videoURI)
	if (video) return { kind: 'video', url: video, poster: uri !== video ? uri : undefined }
	const type = String(source.contentType ?? source.type ?? '').toLowerCase()
	const looksVideo = type.startsWith('video') || type === 'gifv' || type.includes('video')
	const byExtension = candidates.find(url => VIDEO_EXT.test(url))
	if (looksVideo || byExtension) {
		const url = byExtension ?? str(source.sourceURI) ?? uri
		if (url) return { kind: 'video', url }
	}

	if (!logged) {
		logged = true
		if (DEBUG) console.log(`${TAG} not a video source; keys: ${Object.keys(source).join(',')} type=${type}`)
	}
	return undefined
}
