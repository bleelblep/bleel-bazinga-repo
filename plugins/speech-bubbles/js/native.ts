/** Calls into the native side (SpeechBubblesPlugin.kt). Failures are reported, never thrown at the caller. */

import * as modulesNative from '@valenced/modules/native'
import { callNativeMethod } from '@valenced/modules/native'
import { reportError } from '../../../shared/report'
import type { BubbleColors } from './theme'

export interface SpeechBubblesStorage {
	/** Bubbles in servers too. Off: DMs and group DMs only. */
	everywhere: boolean
	/**
	 * Where the bubble colours come from: the theme, the theme with the two sides swapped (others
	 * get the accent colour, you the surface colour; sides don't change), or [ownColor] and
	 * [otherColor]. Replaced `swapColors` and `customColors` in 0.4.0 (see [migrateColors]).
	 */
	colors: ColorMode
	/** Message times on bubbles (everyone's): never, under the bubble on tap, or a pop-up above it on tap. */
	times: 'hidden' | 'below' | 'popup'
	/** `#RRGGBB` for "My own" colours, or '' for the theme's colour on that side. */
	ownColor: string
	otherColor: string
	/** A tail on the last bubble of a run. */
	tails: boolean
	/** Typing bubble above the message box instead of Discord's "…is typing" line. */
	typingBubble: boolean
	/** Other people's avatars hidden; their bubbles and names move into the free column. */
	hideAvatars: boolean
	/** In chats with two or more other people, each person's bubbles get their own colour. */
	perPerson: boolean
	/**
	 * Where "Colour per person" gets its colours: hues next to the theme's own (default), soft
	 * shades turned from their bubble colour, or the main colour of each person's profile picture.
	 */
	personPalette: PersonPalette
	/** "Dark colours only": every person colour is darkened, so white text reads on all of them. */
	personDark: boolean
	/** Other people's names above their bubbles hidden (avatars stay, unless hidden too). */
	hideNames: boolean
	/** With [hideNames]: the two-finger swipe shows each person's name above their time. */
	swipeNames: boolean
	/** A small centred time above the first message after an hour's quiet. */
	timeBreaks: boolean
	/** Hidden spoilers drawn as moving specks; tap or rub to reveal. */
	invisibleInk: boolean
	/** Discord's reaction chips as round pills in the bubble colours (yours in yours), like iOS. */
	iosReactions: boolean
	/**
	 * Reactions on the bubble's top corner, like iMessage tapbacks, instead of under the message.
	 * Retired in 0.5.32 (the user asked for the old style back): always sent to native as false.
	 */
	tapbackCorner: boolean
	/** Two fingers dragging the chat left slide your bubbles aside and show every message's time. */
	swipeTimes: boolean
	/** Your sent message flies from the message box into its place (Flights.kt). */
	sendAnimation: boolean
	/** Like iMessage (the box shrinks into the bubble, then rises into place), or pop up in place. */
	sendStyle: SendStyle
	sendSpeed: SendSpeed
	/** A light tick when the message lands. */
	sendHaptic: boolean
	/** Bubbles' corner roundness in dp (18 is iMessage's); past half a bubble's height draws a pill. */
	bubbleRadius: number
	/** "Bubble opacity" in percent, 30 to 100: below 100 the chat shows through the bubbles. */
	bubbleOpacity: number
	/** Every bubble's colour shifts down the screen and changes as you scroll, like iMessage's blue. */
	scrollColor: boolean
	/** How strong that shift is, 20 to 100 (50 is the default look). */
	scrollColorStrength: number
	/** Our own sounds: a whoosh when you send, a pop when a message comes into the open chat, a tick when you react. */
	sounds: boolean
	/** A light vibration when you send or react. */
	haptics: boolean
	/** Sound volume in percent, 10 to 100. */
	soundVolume: number
	/** Discord's "(edited)" in the text replaced by "Edited" under the bubble. */
	editedLabel: boolean
	/** Your profile picture on the right, beside the first bubble of each run. */
	ownAvatar: boolean
}

export type SendStyle = 'imessage' | 'pop'
export type SendSpeed = 'quick' | 'normal' | 'relaxed'

export type ColorMode = 'theme' | 'swapped' | 'own'

export type PersonPalette = 'theme' | 'hues' | 'avatar'

/** The stored keys before 0.4.0, read only to migrate them. */
interface OldColorKeys {
	colors?: unknown
	swapColors?: unknown
	customColors?: unknown
	ownColor?: unknown
	otherColor?: unknown
}

/**
 * The 0.4.0 colour choice from the two old switches, or undefined when [stored] already has one.
 * Own colours won over swap; with both on, the swap is kept by swapping the two picked colours.
 */
export function migrateColors(
	stored: OldColorKeys | undefined,
):
	| Pick<SpeechBubblesStorage, 'colors' | 'ownColor' | 'otherColor'>
	| undefined {
	// Nothing to migrate unless a pre-0.4.0 switch is actually stored. Before 0.5.32 an unread
	// file (cache not loaded yet) or a missing key "migrated" to the theme's colours and wrote that
	// over the saved choice, so picked colours were lost on every restart.
	if (!stored) return undefined
	const old = stored
	if (
		old.colors === 'theme' ||
		old.colors === 'swapped' ||
		old.colors === 'own'
	)
		return undefined
	if (old.swapColors === undefined && old.customColors === undefined)
		return undefined
	const own = typeof old.ownColor === 'string' ? old.ownColor : ''
	const other = typeof old.otherColor === 'string' ? old.otherColor : ''
	if (old.customColors === true)
		return old.swapColors === true
			? { colors: 'own', ownColor: other, otherColor: own }
			: { colors: 'own', ownColor: own, otherColor: other }
	return {
		colors: old.swapColors === true ? 'swapped' : 'theme',
		ownColor: own,
		otherColor: other,
	}
}

/**
 * Older stored values: "tap" (before 0.2.4) and "beside" (before 0.2.9) are under the bubble now,
 * "toast" (0.2.4) is the pop-up.
 */
export function migrateTimes(value: unknown): SpeechBubblesStorage['times'] {
	if (value === 'tap' || value === 'beside') return 'below'
	if (value === 'toast') return 'popup'
	return value === 'below' || value === 'popup' ? value : 'hidden'
}

export const DEFAULTS: SpeechBubblesStorage = {
	everywhere: false,
	colors: 'theme',
	times: 'hidden',
	ownColor: '',
	otherColor: '',
	tails: true,
	typingBubble: false,
	hideAvatars: false,
	perPerson: true,
	personPalette: 'theme',
	personDark: false,
	hideNames: false,
	swipeNames: true,
	timeBreaks: true,
	invisibleInk: false,
	iosReactions: true,
	tapbackCorner: false,
	swipeTimes: false,
	sendAnimation: false,
	sendStyle: 'imessage',
	sendSpeed: 'normal',
	sendHaptic: true,
	bubbleRadius: 18,
	bubbleOpacity: 100,
	scrollColor: true,
	scrollColorStrength: 50,
	sounds: false,
	haptics: true,
	soundVolume: 60,
	editedLabel: true,
	ownAvatar: false,
}

/** What native is told: the settings plus the theme's colours as `#RRGGBBAA` (already swapped). */
export type BubbleConfig = Pick<
	SpeechBubblesStorage,
	| 'everywhere'
	| 'times'
	| 'tails'
	| 'hideAvatars'
	| 'perPerson'
	| 'timeBreaks'
	| 'invisibleInk'
	| 'iosReactions'
	| 'tapbackCorner'
	| 'swipeTimes'
	| 'hideNames'
	| 'swipeNames'
	| 'editedLabel'
	| 'ownAvatar'
> &
	BubbleColors & {
		custom: boolean
		bubbleRadius: number
		/** 0.3 to 1. */
		bubbleOpacity: number
		/** "Colour per person" soft shades, `#RRGGBBAA`; native picks one per person by their id. */
		personColors: string[]
		/** Where the colours come from; 'theme' slots go out in the order people show up. */
		personSource: PersonPalette
		/** "Dark colours only", for the avatar colours native works out itself. */
		personDark: boolean
		scrollColor: boolean
		/** 0.4 to 2; 1 is the default look. */
		scrollColorStrength: number
	}

/** What the native side reports for the settings page's diagnostics. Never holds message text. */
export interface BubbleStatus {
	/** Discord's message row bind is hooked. */
	hooked: boolean
	/** The bind method that was matched, as a signature string. */
	method?: string
	/** Rows on screen (or recycled) that are drawn as bubbles right now. */
	styledRows: number
	/** Message type names seen so far (bounded), to check the type filter on new Discord builds. */
	seenTypes?: string[]
	everywhere?: boolean
	tails?: boolean
	hideAvatars?: boolean
	/** Link span classes whose colour is checked against the bubble. */
	linkSpanClasses?: number
	/** Link colours replaced because they were too close to the bubble. */
	linkRecolours?: number
	custom?: boolean
	times?: string
	/** Plain taps that showed or hid a time. */
	tapToggles?: number
	/** Time pop-ups shown. */
	popupsShown?: number
	/** Touch-downs and plain taps seen on bubble rows, and why the last tap didn't count. */
	rowTouchDowns?: number
	rowTapsSeen?: number
	lastTapSkip?: string
	messageIdGetter?: string
	/** Own rows whose avatar Discord showed again after the bind, hidden again. */
	ownAvatarsRehidden?: number
	/** The colours in use, as `#RRGGBBAA`. */
	colors?: Record<string, string>
	/** Which theme token each colour came from, or `fallback`. */
	tokens?: Record<string, string>
	/** How many binds saw each group position (ONLY/START/MIDDLE/END). */
	positions?: Record<string, number>
	/** The Message getter for the author id, used for run time templates. */
	authorGetter?: string
	/** The last error, if any. */
	error?: string
}

/** Async: nothing waits for it, and a sync call would block the JS thread. */
export function configure(config: BubbleConfig): void {
	callNativeMethod('bleelblep.speech-bubbles.configure', [config]).catch(
		error => reportError('[SpeechBubbles] configure failed:', error),
	)
}

/** The messages of [channelId] that start a block after a quiet gap ("Time breaks"). */
export function setBreaks(channelId: string, ids: string[]): void {
	callNativeMethod('bleelblep.speech-bubbles.breaks', [channelId, ids]).catch(
		error => reportError('[SpeechBubbles] breaks failed:', error),
	)
}

/** The open channel and whether it's a group (group DM or server), for "Colour per person". */
export function setChannel(id: string, group: boolean): void {
	callNativeMethod('bleelblep.speech-bubbles.channel', [id, group]).catch(
		error => reportError('[SpeechBubbles] channel failed:', error),
	)
}

export function status(): Promise<BubbleStatus | undefined> {
	return callNativeMethod('bleelblep.speech-bubbles.status', []).catch(
		error => {
			reportError('[SpeechBubbles] status failed:', error)
			return undefined
		},
	)
}

/** Where the chat's columns are, in dp, for the typing bubble. Never throws. */
export interface ChatMetrics {
	/** Left edge of their bubbles' body. */
	bubbleLeft?: number
	/** Centre of the avatar column. */
	avatarCenter?: number
	/** Taken from a row on screen (else from Discord's dimensions). */
	measured?: boolean
}

export function chatMetrics(): Promise<ChatMetrics> {
	return callNativeMethod('bleelblep.speech-bubbles.metrics', []).catch(
		error => {
			reportError('[SpeechBubbles] metrics failed:', error)
			return {}
		},
	)
}

/** Multiplies the 300 ms base duration. */
export const SEND_SPEEDS: Record<SendSpeed, number> = {
	quick: 0.7,
	normal: 1,
	relaxed: 1.5,
}

/** Turns the send animation's hook on or off and sets its look. Never throws. */
export function configureFlight(
	s: Pick<
		SpeechBubblesStorage,
		'sendAnimation' | 'sendStyle' | 'sendSpeed' | 'sendHaptic'
	>,
): void {
	callNativeMethod('bleelblep.speech-bubbles.flightConfigure', [
		{
			enabled: s.sendAnimation === true,
			style: s.sendStyle === 'pop' ? 'pop' : 'imessage',
			speed: SEND_SPEEDS[s.sendSpeed] ?? 1,
			haptic: s.sendHaptic !== false,
		},
	]).catch(error =>
		reportError('[SpeechBubbles] send animation configure failed:', error),
	)
}

/**
 * Synchronous on purpose: called from inside the MESSAGE_CREATE dispatch, so native knows the id
 * before the chat list draws the row. A failure only means the message appears as usual.
 */
export function expectFlight(id: string): void {
	try {
		;(modulesNative as any).callNativeMethodSync(
			'bleelblep.speech-bubbles.flightExpect',
			[id],
		)
	} catch {}
}

/** The server's copy ([id]) replaced the sending one ([nonce]): it must not fly again. */
export function settleFlight(nonce: string, id: string): void {
	try {
		;(modulesNative as any).callNativeMethodSync(
			'bleelblep.speech-bubbles.flightSettle',
			[nonce, id],
		)
	} catch {}
}

export interface FlightStatus {
	hooked: boolean
	flown?: number
	error?: string | null
}

export function flightStatus(): Promise<FlightStatus | undefined> {
	return callNativeMethod('bleelblep.speech-bubbles.flightStatus', [])
		.then(value =>
			value && typeof value === 'object' ? (value as FlightStatus) : undefined,
		)
		.catch(() => undefined)
}

/** Sounds and haptics on or off, and the volume. Never throws. */
export function configureFeedback(
	s: Pick<SpeechBubblesStorage, 'sounds' | 'haptics' | 'soundVolume'>,
): void {
	callNativeMethod('bleelblep.speech-bubbles.feedbackConfigure', [
		{
			sounds: s.sounds === true,
			haptics: s.haptics === true,
			volume: Math.min(Math.max(s.soundVolume ?? 60, 10), 100) / 100,
		},
	]).catch(error => reportError('[SpeechBubbles] sounds configure failed:', error))
}

/**
 * A sound and/or tick for [kind]; [haptic] false plays the sound only. [test] (the settings page's
 * "Try" rows) plays both whatever the switches say. Never throws.
 */
export function feedback(kind: FeedbackKind, haptic = true, test = false): void {
	callNativeMethod('bleelblep.speech-bubbles.feedback', [kind, haptic, test]).catch(() => {})
}

export interface FeedbackStatus {
	played?: number
	vibrated?: number
	/** Why the last sound or vibration didn't happen. */
	skip?: string | null
	error?: string | null
}

export function feedbackStatus(): Promise<FeedbackStatus | undefined> {
	return callNativeMethod('bleelblep.speech-bubbles.feedbackStatus', [])
		.then(v => (v && typeof v === 'object' ? (v as FeedbackStatus) : undefined))
		.catch(() => undefined)
}

export type FeedbackKind = 'send' | 'receive' | 'react'

declare module '@valenced/modules/native' {
	interface NativeMethods {
		'bleelblep.speech-bubbles.channel': [[id: string, group: boolean], null]
		'bleelblep.speech-bubbles.breaks': [
			[channelId: string, ids: string[]],
			null,
		]
		'bleelblep.speech-bubbles.metrics': [[], ChatMetrics]
		'bleelblep.speech-bubbles.configure': [[config: BubbleConfig], null]
		'bleelblep.speech-bubbles.status': [[], BubbleStatus]
		'bleelblep.speech-bubbles.flightConfigure': [
			[config: Record<string, unknown>],
			null,
		]
		'bleelblep.speech-bubbles.flightExpect': [[id: string], null]
		'bleelblep.speech-bubbles.flightSettle': [[nonce: string, id: string], null]
		'bleelblep.speech-bubbles.flightReplay': [[slowBy: number], null]
		'bleelblep.speech-bubbles.flightStatus': [[], FlightStatus]
		'bleelblep.speech-bubbles.layoutProbe': [[], Record<string, unknown>]
		'bleelblep.speech-bubbles.feedbackConfigure': [
			[config: Record<string, unknown>],
			null,
		]
		'bleelblep.speech-bubbles.feedback': [
			[kind: FeedbackKind, haptic: boolean, test: boolean],
			null,
		]
		'bleelblep.speech-bubbles.feedbackStatus': [[], FeedbackStatus]
	}
}
