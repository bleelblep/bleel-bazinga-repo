/** Round Corners' settings: one switch per square, and how the selected server should look. */

import * as react from '@valenced/react'

export type SelectedLook = 'classic' | 'round'

export interface SquaresStorage {
	/** Server icons round. */
	serverIcons: boolean
	/** 'classic' = the selected server morphs into a rounded square like old Discord; 'round' = always a circle. */
	selected: SelectedLook
	/** The Home / DMs, Create and Discover buttons in the server bar. */
	serverBarButtons: boolean
	/** The You bar as a pill with round buttons. */
	youBar: boolean
	/** The chat bar's buttons (send, emoji, media, gift, apps) as circles. */
	chatButtons: boolean
	/** The chat message box as a pill. */
	chatInput: boolean
	/** The You tab's Quests / Shop / Settings buttons as circles. */
	youNav: boolean
	/** Every other corner token back to its pre-redesign value. */
	otherCorners: boolean
	changelogSeenVersion?: string
}

export const DEFAULTS: SquaresStorage = {
	serverIcons: true,
	selected: 'classic',
	serverBarButtons: true,
	youBar: true,
	chatButtons: true,
	chatInput: true,
	youNav: true,
	otherCorners: true,
}

let storage: any
const listeners = new Set<() => void>()

export function setStorage(handle: any) {
	storage = handle
}

export function settings(): SquaresStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

export function update(patch: Partial<SquaresStorage>) {
	storage?.set(patch)
	for (const listener of listeners) listener()
}

export function onChange(listener: () => void): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export function useSettings(): SquaresStorage {
	const { React } = react
	const [, bump] = React.useState(0)
	React.useEffect(() => onChange(() => bump(n => n + 1)), [])
	return settings()
}
