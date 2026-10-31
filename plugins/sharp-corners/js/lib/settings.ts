/** Sharp Corners' switches. */

import * as react from '@valenced/react'

export interface CirclesStorage {
	/** Discord's screens (React Native views and pictures) and the corner tokens. */
	app: boolean
	/** Discord's own Android views: the chat list, embeds, attachments, voice messages. */
	native: boolean
	/** Circles become squares too (avatars, status dots, round buttons). */
	ovals: boolean
	changelogSeenVersion?: string
}

export const DEFAULTS: CirclesStorage = { app: true, native: true, ovals: true }

let storage: any
const listeners = new Set<() => void>()

export function setStorage(handle: any) {
	storage = handle
}

export function settings(): CirclesStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

export function update(patch: Partial<CirclesStorage>) {
	storage?.set(patch)
	for (const listener of listeners) listener()
}

export function onChange(listener: () => void): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export function useSettings(): CirclesStorage {
	const { React } = react
	const [, bump] = React.useState(0)
	React.useEffect(() => onChange(() => bump(n => n + 1)), [])
	return settings()
}
