import type { SendTweaksStorage } from './types'

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start.
 */
export const DEFAULTS: SendTweaksStorage = {
	// On: removing tracking never changes where a link goes, so there is nothing to lose.
	cleanUrls: true,
	// On: it only ever adds to what is removed, and the built-in list is used until it downloads.
	clearUrlsRules: true,
	clearUrlsData: null,
	// Off: pinging on reply is Discord's default and plenty of people rely on it. This is a
	// preference to opt into, not a fix.
	noReplyMention: false,
	// The list is empty, so `except` behaves exactly like the switch did before the list existed.
	replyPingMode: 'except',
	replyPingPeople: [],
	// On, with no rules: harmless until you add one, and adding one should just work.
	textReplace: true,
	rules: [],
	// On, with no rules: nothing happens until you add or import one.
	linkRewrite: true,
	linkRules: [],
	// Off: a message nobody is notified about is easy to miss, so this is only ever a choice.
	silentMessages: false,
	// On: holding send does nothing in stock Discord, and both need a deliberate hold and slide.
	swipePreview: true,
	swipeSendUnchanged: true,
	// Off: it adds a step to every message. The way in for anyone the hold doesn't work for.
	tapToPreview: false,
	applyToEdits: true,
	debugLogging: false,
	greetingsUnlocked: false,
	snippets: [],
	dateFormat: '',
	timeFormat: '',
	// Off: it changes how every message reads, so it is a choice. The parts default to the two
	// that are almost always wanted; the full stop annoys plenty of people in casual chat.
	polishWording: false,
	polishApostrophes: true,
	polishCapitals: true,
	polishFullStop: false,
	polishSkip: '',
}
