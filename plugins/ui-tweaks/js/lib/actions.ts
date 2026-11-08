/**
 * What a gesture can do, for patches/swipe.ts and patches/doubleTap.tsx. Every action reads
 * Discord's module when it runs (coding rule 1), found by path (hermes-dec of 350.4 and 352.2):
 *
 * - react / react2: `modules/double_tap_to_react/native/DoubleTapToReactUtils.tsx`
 *   `handleAddDefaultDoubleTapReaction(message, channel)` (your Discord double-tap emoji, with its
 *   permission and Nitro checks), or `modules/reactions/ReactionActionCreators.tsx`
 *   `addReaction(channelId, messageId, emoji, location)` / `removeReaction({channelId, messageId, emoji, location})`
 *   for a chosen emoji; toggles off when you already reacted with it.
 * - copy: `utils/ClipboardUtils.native.tsx` `copy(text)`. link and quote reuse it / the message box.
 * - mention / quote: `modules/autocompleter/native/AutocompleteUtils.tsx` `getMentionTextWithUser(channel, user)`
 *   into `chatInputRef.current.insertText(text, null, true)`, exactly what Discord's username tap does
 *   on Android (`handleTapUsername`).
 * - menu: the instance's own `handleLongPressMessage(event)`, the long-press path.
 * - unread: `modules/messages/markUnread.tsx` `markUnread(channelId, messageId)`.
 * - pin: `actions/ChannelPinActionCreators.tsx` default `pinMessage(channel, messageId)` /
 *   `unpinMessage(channel, messageId)`, what the long-press Pin row's confirm calls (352.2 bundle).
 * - forward: `modules/forwarding/native/ForwardModalUtils.tsx` `openForwardModal({ message, source })`,
 *   Discord's own forward sheet; the long-press row passes `source: 'long-press-sheet'`.
 * - thread: `modules/messages/native/long_press/LongPressMessageActionSheetUtils.tsx`
 *   `handleCreateThread(channel, message, 'Message')`, the long-press row's own handler.
 * - profile: `modules/user_profile/native/showUserProfileActionSheet.tsx` default
 *   `({ userId, channelId, messageId })`, as the long-press Profile row builds it.
 * - userId: the author's id, through the same clipboard copy.
 * - roleColor: the author's name colour in that server, `GuildMemberStore.getMember(guildId, userId).colorString`
 *   (what the chat name colour reads; 352.2 bundle), through the same clipboard copy. Read only.
 * - delete: `actions/MessageActionCreators.tsx` default `deleteMessage(channelId, messageId)` (a third `true` deletes locally only),
 *   the long-press Delete row's call, behind our confirm dialog (the row's confirm is in its sheet).
 *
 * Every Discord call is the one the long-press menu's own row makes, so permissions, confirms and
 * rate limits stay Discord's (account-safety AS-02: no requests of our own). Each gesture runs one
 * action once; nothing retries.
 */

import type { SwipeAction, UITweaksStorage } from '../defaults'
import type { Gesture } from './gestures'
import { confirmDestructive } from '../../../../shared/ui/confirm'
import { showToast } from '../../../../shared/toast'
import { reportError } from '../../../../shared/report'
import { Stores } from '@valenced/discord/flux'
import * as discordFinders from '@valenced/discord/utils/modules/finders'

const TAG = '[UITweaks]'
const TOAST = 'UITweaksSwipe'

function moduleAt(path: string): any {
	try {
		const found = (discordFinders as any).lookupModuleWithImportedPath(path)
		return Array.isArray(found) ? found[0] : found
	} catch {
		return undefined
	}
}

/** The first of [paths] that exports a function called [name] (on itself or `default`). */
function fnFrom(paths: string[], name: string): ((...args: any[]) => any) | undefined {
	for (const path of paths) {
		const mod = moduleAt(path)
		const fn = mod?.[name] ?? mod?.default?.[name]
		if (typeof fn === 'function') return fn
	}
	return undefined
}

// Paths from the 352.2 bundle; each list is tried in order (lookups are by exact path, so misses are cheap).
const PIN_MODULES = ['actions/ChannelPinActionCreators.tsx']
const DELETE_MODULES = ['actions/MessageActionCreators.tsx']
const FORWARD_MODULES = ['modules/forwarding/native/ForwardModalUtils.tsx']
const PROFILE_MODULES = ['modules/user_profile/native/showUserProfileActionSheet.tsx']
const THREAD_MODULES = ['modules/messages/native/long_press/LongPressMessageActionSheetUtils.tsx']

/** A module's default export when it is itself the function (showUserProfileActionSheet). */
function defaultFn(paths: string[]): ((...args: any[]) => any) | undefined {
	for (const path of paths) {
		const mod = moduleAt(path)
		const fn = typeof mod === 'function' ? mod : mod?.default
		if (typeof fn === 'function') return fn
	}
	return undefined
}

export interface SwipeTarget {
	instance: any
	event: any
	messageId: string | undefined
	message: any
	channel: any
	/** The instance's original reply and edit handlers. */
	reply?: (event: any) => unknown
	edit?: (event: any) => unknown
}

/** The message a chat event is about, from the handlers instance's own message data. */
export function targetOf(instance: any, event: any): SwipeTarget {
	const messageId = event?.nativeEvent?.messageId ?? event?.messageId
	const data = messageId != null ? instance.getMessageData?.(String(messageId)) : undefined
	return { instance, event, messageId, message: data?.message, channel: data?.messageChannel ?? data?.channel }
}

export function isOwn(message: any): boolean {
	const me = (Stores as any).UserStore?.getCurrentUser?.()?.id
	return Boolean(me && message?.author?.id === me)
}

function react(target: SwipeTarget, emoji: string) {
	const { message, channel } = target
	if (!message || !channel) return
	if (!emoji) {
		const utils = moduleAt('modules/double_tap_to_react/native/DoubleTapToReactUtils.tsx')
		const fn = utils?.handleAddDefaultDoubleTapReaction ?? utils?.default?.handleAddDefaultDoubleTapReaction
		if (typeof fn !== 'function') throw new Error("Discord's double-tap reaction isn't available")
		fn(message, channel)
		return
	}
	const actions = moduleAt('modules/reactions/ReactionActionCreators.tsx')
	const creators = actions?.addReaction ? actions : actions?.default
	if (typeof creators?.addReaction !== 'function') throw new Error("Discord's reactions aren't available")
	const location = creators.ReactionLocations?.DOUBLE_TAP ?? 'Double Tap'
	const reactEmoji = { id: null, name: emoji, animated: false }
	const mine = (message.reactions ?? []).some((r: any) => r?.emoji?.name === emoji && !r?.emoji?.id && (r?.me || r?.me_burst))
	if (mine) creators.removeReaction({ channelId: channel.id, messageId: message.id, emoji: reactEmoji, location })
	else creators.addReaction(channel.id, message.id, reactEmoji, location)
}

function copyText(text: string) {
	const clipboard = moduleAt('utils/ClipboardUtils.native.tsx')
	const fn = clipboard?.copy ?? clipboard?.default?.copy
	if (typeof fn !== 'function') throw new Error("Discord's clipboard isn't available")
	fn(text)
}

function copy(target: SwipeTarget) {
	const text = target.message?.content
	if (!text) {
		showToast('That message has no text to copy.', TOAST)
		return
	}
	copyText(text)
	showToast('Copied.', TOAST)
}

/** The message's link, the way Discord's Copy Message Link row builds it. */
function link(target: SwipeTarget) {
	const { channel, message } = target
	if (!channel || !message) return
	const guild = channel.guild_id ?? channel.guildId ?? '@me'
	copyText(`https://discord.com/channels/${guild}/${channel.id}/${message.id}`)
	showToast('Link copied.', TOAST)
}

function copyUserId(target: SwipeTarget) {
	const id = target.message?.author?.id
	if (!id) return
	copyText(String(id))
	showToast('User ID copied.', TOAST)
}

/** The author's role colour in this server, as Discord shows their name. */
function copyRoleColor(target: SwipeTarget) {
	const { channel, message } = target
	const userId = message?.author?.id
	if (!userId) return
	const guildId = channel?.guild_id ?? channel?.guildId
	if (!guildId) {
		showToast('Role colors only exist in servers.', TOAST)
		return
	}
	const color: unknown = (Stores as any).GuildMemberStore?.getMember?.(guildId, userId)?.colorString
	if (typeof color !== 'string' || !color) {
		showToast("They don't have a role color here.", TOAST)
		return
	}
	copyText(color.toUpperCase())
	showToast(`Copied ${color.toUpperCase()}.`, TOAST)
}

/** The chat's text box, from the handlers instance's params. */
function inputOf(instance: any): { insertText: (text: string, a: unknown, b: boolean) => void } {
	const params = typeof instance.getParams === 'function' ? instance.getParams() : instance.params
	const input = params?.chatInputRef?.current
	if (typeof input?.insertText !== 'function') throw new Error("the message box isn't available")
	return input
}

function mention(target: SwipeTarget) {
	const { instance, message, channel } = target
	const user = message?.author?.id ? ((Stores as any).UserStore?.getUser?.(message.author.id) ?? message.author) : undefined
	if (!user) return
	const input = inputOf(instance)
	const utils = moduleAt('modules/autocompleter/native/AutocompleteUtils.tsx')
	const format = utils?.getMentionTextWithUser ?? utils?.default?.getMentionTextWithUser
	const text = typeof format === 'function' ? format(channel, user) : `<@${user.id}>`
	input.insertText(text, null, true)
}

/** The text as a Markdown quote, one `> ` per line, then a blank line to type under. */
function quote(target: SwipeTarget) {
	const text: string | undefined = target.message?.content
	if (!text) {
		showToast('That message has no text to quote.', TOAST)
		return
	}
	const quoted = text
		.split('\n')
		.map(line => `> ${line}`)
		.join('\n')
	inputOf(target.instance).insertText(`${quoted}\n`, null, true)
}

function markUnread(target: SwipeTarget) {
	const { channel, message } = target
	if (!channel || !message) return
	const mod = moduleAt('modules/messages/markUnread.tsx')
	const fn = mod?.markUnread ?? mod?.default
	if (typeof fn !== 'function') throw new Error("Discord's mark unread isn't available")
	fn(channel.id, message.id)
	showToast('Marked unread from here.', TOAST)
}

function pin(target: SwipeTarget) {
	const { channel, message } = target
	if (!channel || !message) return
	const pinned = Boolean(message.pinned)
	const fn = fnFrom(PIN_MODULES, pinned ? 'unpinMessage' : 'pinMessage')
	if (!fn) throw new Error("Discord's pinning isn't available")
	// Discord's own row: the channel record and the message id. Permission errors come back as its
	// own alert, the same as from the long-press menu.
	return fn(channel, message.id)
}

function forward(target: SwipeTarget) {
	const { channel, message } = target
	if (!channel || !message) return
	const fn = fnFrom(FORWARD_MODULES, 'openForwardModal')
	if (!fn) throw new Error("Discord's forward sheet isn't available")
	return fn({ message, source: 'long-press-sheet' })
}

function thread(target: SwipeTarget) {
	const { channel, message } = target
	if (!channel || !message) return
	const fn = fnFrom(THREAD_MODULES, 'handleCreateThread')
	if (!fn) throw new Error("Discord's thread creation isn't available")
	return fn(channel, message, 'Message')
}

function profile(target: SwipeTarget) {
	const { channel, message } = target
	const userId = message?.author?.id
	if (!userId) return
	const fn = defaultFn(PROFILE_MODULES)
	if (!fn) throw new Error("Discord's profile sheet isn't available")
	return fn({ userId, channelId: channel?.id, messageId: message.id })
}

function remove(target: SwipeTarget) {
	const { channel, message } = target
	if (!channel || !message) return
	if (!isOwn(message)) {
		showToast('Only your own messages can be deleted this way.', TOAST)
		return
	}
	const fn = fnFrom(DELETE_MODULES, 'deleteMessage')
	if (!fn) throw new Error("Discord's delete isn't available")
	confirmDestructive({
		title: 'Delete message',
		body: 'Delete this message for everyone? This can’t be undone.',
		action: 'Delete',
		onConfirm: () => {
			// Discord's delete is async: a refused request rejects later, and a rejection nobody
			// listened to left the message there with no word why. Reported once, never retried (AS-05).
			const failed = (error: unknown) => {
				reportError(`${TAG} delete failed:`, error)
				const why = (error as any)?.body?.message ?? (error as Error)?.message ?? String(error)
				showToast(`Couldn't delete: ${why}`, TOAST)
			}
			try {
				// Two arguments only: a third `true` makes Discord drop the message locally without
				// asking the server (352.2 MessageActionCreators: it skips HTTP.del), so it came back.
				const result = fn(channel.id, message.id)
				if (result && typeof result.then === 'function') result.then(undefined, failed)
			} catch (error) {
				failed(error)
			}
		},
	})
}

/** Which gesture ran an action: the two swipe stages, or a double-tap (patches/doubleTap.tsx). */
export type GestureStage = 'short' | 'long' | 'doubleTap'

const GESTURE_NAME: Record<GestureStage, string> = { short: 'swipe', long: 'swipe', doubleTap: 'double-tap' }

/**
 * Runs [action] for a gesture; `stage` decides what `stock` means for a swipe. A double-tap's
 * `stock` is Discord's own reaction, which only its original handler can run, so the double-tap
 * patch handles it before calling this. [s] supplies the React emojis.
 */
export function runSwipeAction(action: SwipeAction, stage: GestureStage, target: SwipeTarget, s: Pick<UITweaksStorage, 'swipeEmoji' | 'swipeEmoji2'>): unknown {
	const { instance, event } = target
	const reply = () => target.reply?.call(instance, event)
	try {
		switch (action) {
			case 'stock':
				// Discord's own: short = reply; long = edit on your messages, reply on others'.
				if (stage === 'long' && isOwn(target.message)) return target.edit?.call(instance, event)
				return reply()
			case 'reply':
				return reply()
			case 'edit':
				if (isOwn(target.message)) return target.edit?.call(instance, event)
				showToast('Only your own messages can be edited.', TOAST)
				return undefined
			case 'react':
				return react(target, s.swipeEmoji)
			case 'react2':
				return react(target, s.swipeEmoji2)
			case 'copy':
				return copy(target)
			case 'link':
				return link(target)
			case 'userId':
				return copyUserId(target)
			case 'roleColor':
				return copyRoleColor(target)
			case 'quote':
				return quote(target)
			case 'mention':
				return mention(target)
			case 'pin':
				return pin(target)
			case 'forward':
				return forward(target)
			case 'thread':
				return thread(target)
			case 'profile':
				return profile(target)
			case 'menu':
				if (typeof instance.handleLongPressMessage === 'function') return instance.handleLongPressMessage(event)
				throw new Error("the message menu isn't available")
			case 'unread':
				return markUnread(target)
			case 'delete':
				return remove(target)
			case 'nothing':
				return undefined
		}
	} catch (error) {
		reportError(`${TAG} ${GESTURE_NAME[stage]} ${stage} (${action}) failed:`, error)
		showToast(`That ${GESTURE_NAME[stage]} didn't work: ${(error as Error)?.message ?? error}`, TOAST)
	}
	return undefined
}

export interface ActionChoice {
	value: SwipeAction
	label: string
	subLabel: string
	/** Only offered for your own messages. */
	ownOnly?: boolean
}

export const SWIPE_ACTIONS: ActionChoice[] = [
	{ value: 'stock', label: "Discord's", subLabel: 'Reply, or edit your own message on the further swipe' },
	{ value: 'reply', label: 'Reply', subLabel: 'Reply to the message' },
	{ value: 'edit', label: 'Edit', subLabel: 'Edit the message', ownOnly: true },
	{ value: 'react', label: 'React', subLabel: 'Add your reaction, or take it back' },
	{ value: 'react2', label: 'Second react', subLabel: 'Add the second emoji, or take it back' },
	{ value: 'copy', label: 'Copy text', subLabel: "Copy the message's text" },
	{ value: 'link', label: 'Copy link', subLabel: 'Copy a link to the message' },
	{ value: 'userId', label: 'Copy user ID', subLabel: "Copy the author's user ID" },
	{ value: 'roleColor', label: 'Copy role color', subLabel: "Copy the hex color of the author's name in this server" },
	{ value: 'quote', label: 'Quote', subLabel: 'Put the text in your message box as a quote' },
	{ value: 'mention', label: 'Mention', subLabel: 'Put @author in your message box' },
	{ value: 'pin', label: 'Pin or unpin', subLabel: 'Pin the message, or unpin it if it already is' },
	{ value: 'forward', label: 'Forward', subLabel: "Open Discord's forward sheet" },
	{ value: 'thread', label: 'New thread', subLabel: 'Start a thread from the message' },
	{ value: 'profile', label: 'Open profile', subLabel: "The author's profile" },
	{ value: 'menu', label: 'Open the menu', subLabel: 'The long-press menu for that message' },
	{ value: 'unread', label: 'Mark unread', subLabel: 'Mark the channel unread from that message' },
	{ value: 'delete', label: 'Delete', subLabel: 'Delete the message, after a confirm', ownOnly: true },
	{ value: 'nothing', label: 'Nothing', subLabel: 'The gesture does nothing' },
]

/** The choices for one gesture slot: edit and delete only for your own messages, `stock` named for the slot. */
export function actionsFor(gesture: Gesture): ActionChoice[] {
	return SWIPE_ACTIONS.filter(action => gesture.own || !action.ownOnly).map(action =>
		action.value === 'stock' ? { ...action, subLabel: `Discord's own: ${gesture.stock.toLowerCase()}` } : action,
	)
}

/** The label for a slot's current action, for the Gestures page rows. */
export function actionLabel(action: SwipeAction, gesture: Gesture): string {
	if (action === 'stock') return `Discord's: ${gesture.stock.toLowerCase()}`
	return SWIPE_ACTIONS.find(a => a.value === action)?.label ?? action
}
