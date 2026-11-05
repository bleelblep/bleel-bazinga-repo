/**
 * The six gesture slots: double-tap, short swipe and further swipe, each for your own messages and
 * for everyone else's. The settings pages list them from here, and the patches read the slot that
 * matches the message's author (lib/actions.ts `isOwn`).
 */

import type { GestureStage } from './actions'

export type GestureKey = 'doubleTapOwn' | 'doubleTapOthers' | 'swipeShortOwn' | 'swipeShortOthers' | 'swipeLongOwn' | 'swipeLongOthers'

export interface Gesture {
	key: GestureKey
	/** The row label on the Gestures page and the picker page's title. */
	title: string
	/** One line under the picker's list. */
	description: string
	/** What `stock` means for this slot. */
	stock: string
	/** Your own messages (edit and delete are only offered here). */
	own: boolean
	stage: GestureStage
	/** Swipes draw their icon per built row, so a change asks for Valenced's reload. */
	needsReload: boolean
}

export const GESTURES: Gesture[] = [
	{
		key: 'doubleTapOwn',
		title: 'Double-tap your message',
		description: 'Double-tap one of your own messages.',
		stock: 'Add your Discord double-tap reaction',
		own: true,
		stage: 'doubleTap',
		needsReload: false,
	},
	{
		key: 'doubleTapOthers',
		title: "Double-tap someone else's",
		description: "Double-tap anyone else's message.",
		stock: 'Add your Discord double-tap reaction',
		own: false,
		stage: 'doubleTap',
		needsReload: false,
	},
	{
		key: 'swipeShortOwn',
		title: 'Short swipe on your message',
		description: 'Swipe one of your own messages to the left.',
		stock: 'Reply',
		own: true,
		stage: 'short',
		needsReload: true,
	},
	{
		key: 'swipeShortOthers',
		title: "Short swipe on someone else's",
		description: "Swipe anyone else's message to the left.",
		stock: 'Reply',
		own: false,
		stage: 'short',
		needsReload: true,
	},
	{
		key: 'swipeLongOwn',
		title: 'Further swipe on your message',
		description: 'Keep swiping past the first icon.',
		stock: 'Edit',
		own: true,
		stage: 'long',
		needsReload: true,
	},
	{
		key: 'swipeLongOthers',
		title: "Further swipe on someone else's",
		description: 'Keep swiping past the first icon. Others’ messages only have this stage with "Further swipe on every message" on.',
		stock: 'Reply',
		own: false,
		stage: 'long',
		needsReload: true,
	},
]

export function gestureByKey(key: string | undefined): Gesture | undefined {
	return GESTURES.find(g => g.key === key)
}
