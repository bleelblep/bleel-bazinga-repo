/** Picture Links' one option, read at tap time so a change applies to the next picture opened. */

import * as react from '@valenced/react'

export interface PictureLinksStorage {
	/** Animated pictures at the full 4096px too. Heavy: can freeze the app for a few seconds. */
	fullSizeAnimated?: boolean
	changelogSeenVersion?: string
}

let storage: any
const listeners = new Set<() => void>()

export function setStorage(handle: any) {
	storage = handle
}

export function settings(): PictureLinksStorage {
	return { fullSizeAnimated: false, ...(storage?.cache ?? {}) }
}

export function update(patch: Partial<PictureLinksStorage>) {
	storage?.set(patch)
	for (const listener of listeners) listener()
}

export function useSettings(): PictureLinksStorage {
	const { React } = react
	const [, bump] = React.useState(0)
	React.useEffect(() => {
		const listener = () => bump(n => n + 1)
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}, [])
	return settings()
}
