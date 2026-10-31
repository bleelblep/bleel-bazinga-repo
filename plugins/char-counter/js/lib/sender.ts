/**
 * Sending a long message as several: the reviewable version (docs/account-safety.md AS-03 to
 * AS-07; the 0.3.0 review in docs/account-safety-reviews/char-counter-v1.1.md said what had to go).
 *
 * Discord's length check is never raised. Two ways in, both explicit taps:
 *
 * - **Send.** Discord's Send runs `chatInputHandleSendText({ text, params })`
 *   (`modules/chat_input/native/accessories/ChatInputSendUtils.tsx`, 352.2): within the limit it
 *   parses the text and sends it; over it, it shows Discord's "too long" alert and returns
 *   undefined, and nothing is sent. That export is wrapped (not `chatInputValidateContentLength`,
 *   which it calls through its own closure, so a wrap on that export is never reached): within the
 *   limit it runs untouched; over it, with splitting on and a plan that fits, the split starts from
 *   the text Discord just flushed from the box (the `onSend` setting can show the parts first
 *   instead) and undefined is returned, so Discord's own send never runs for the long text. Over
 *   the limit with no plan, Discord's alert shows as before.
 * - **The square.** Past the limit it becomes a button (`lib/badge.tsx`) that opens the sheet
 *   (`ui/SplitSheet.tsx`): where the parts go, how many, every part's text, and "Send N messages".
 *
 * The operation (`lib/operation.ts`) sends one part at a time, each handed once to Discord's own
 * `sendMessage` (the action creator the chat input calls; it resolves with the HTTP response and
 * rejects with the same shape on failure), the next only after the previous was confirmed. A
 * refusal, an unconfirmed result, Stop, closing the sheet, the plugin stopping, a logout or an
 * account change ends it; nothing is resent. The sheet shows the progress and the Stop button
 * either way. When every part is confirmed, the message box is emptied the way Discord's own send
 * does it (`saveDraft('')` and the handle's `clearText()`). If it stopped early, the parts not
 * confirmed are put back in the box, unless the box has changed since, in which case it is left
 * alone and the toast says so.
 *
 * A reply being composed goes on the first part exactly as the chat input sends one: the options
 * from Discord's `getSendMessageOptionsForReply(pendingReply)` (`messageReference`, and
 * `allowedMentions.replied_user: false` when the @ toggle is off), and `deletePendingReply` just
 * before that part goes, as `chatInputSendMessage` does. Attachments are not carried: the sheet
 * says so, so nothing is dropped silently (AS-04); the user can send them on their own.
 */

import { Dispatcher } from '@valenced/discord/common/flux'
import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { reportError } from '../../../../shared/report'
import { showToast } from '../../../../shared/toast'
import { SPLIT_DELAY, SPLIT_MAX } from '../index'
import { openSplitSheet } from '../ui/SplitSheet'
import { CHANNEL_MESSAGE, canWriteBox, currentChannelId, currentText, currentUserId, guildIdOf, pendingReply, rememberChatInputRef, replaceText, slowmodeSeconds } from './input'
import type { PendingReply } from './input'
import { limit } from './length'
import { cancelActive, startOperation } from './operation'
import type { Host, Operation, Progress } from './operation'
import { splitMessage } from './split'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { CharCounterStorage } from '../index'

const TAG = '[CharCounter]'
const TOAST = 'CharCounterToast'

/** The message action creators (`actions/MessageActionCreators.tsx`, default export, 352.2). */
interface MessageActions {
	/** `(channelId, message, waitForChannelReady = true, options)`; resolves or rejects with the HTTP response. */
	sendMessage(channelId: string, message: OutgoingMessage, waitForChannelReady?: unknown, options?: object): unknown
	getSendMessageOptionsForReply?(pendingReply: unknown): object
	editMessage?: unknown
	startEditMessage?: unknown
}

/** `modules/chat_input/native/accessories/ChatInputSendUtils.tsx` (352.2). */
interface SendUtils {
	chatInputHandleSendText(input: { text: string; params?: { channel?: { id?: string }; chatInputRef?: unknown } }): unknown
	chatInputValidateContentLength?: unknown
}

/** The plain text message Discord's own follow-up sends use. */
interface OutgoingMessage {
	content: string
	tts: boolean
	invalidEmojis: unknown[]
	validNonShortcutEmojis: unknown[]
}

/** `saveDraft(channelId, draft, draftType)`: the order Discord's own send uses (352.2). */
interface DraftActions {
	saveDraft?(channelId: string, draft: string, draftType: number): void
	clearDraft?: unknown
	default?: { saveDraft?(channelId: string, draft: string, draftType: number): void }
}

/** The wait between parts, in seconds, clamped and on the slider's half-second steps. */
export function delaySecondsOf(s: Partial<CharCounterStorage>): number {
	const value = Number(s.splitDelaySec)
	if (!Number.isFinite(value)) return SPLIT_DELAY.default
	return Math.min(SPLIT_DELAY.max, Math.max(SPLIT_DELAY.min, Math.round(value / SPLIT_DELAY.step) * SPLIT_DELAY.step))
}

/** The most parts a message may be split into, clamped. */
export function maxPartsOf(s: Partial<CharCounterStorage>): number {
	const value = Number(s.splitMax)
	return Number.isFinite(value) ? Math.min(SPLIT_MAX.max, Math.max(SPLIT_MAX.min, Math.round(value))) : SPLIT_MAX.default
}

/** What a tap on the square would send: the parts, or why there is nothing to offer. */
export interface SplitPlan {
	channelId: string
	text: string
	parts: string[]
	delayMs: number
	/** The reply being composed: the first part is sent as it. */
	reply?: PendingReply
}

/**
 * Plans the split for the message box's current text. Undefined when splitting is off, the text is
 * within the limit, there is no channel, the box on screen cannot be written (then it could not be
 * emptied afterwards, so nothing is offered), or it would take more parts than the setting allows.
 */
export function planSplit(s: CharCounterStorage): SplitPlan | undefined {
	if (!s.split) return undefined
	const channelId = currentChannelId()
	if (!channelId) return undefined
	const text = currentText(channelId)
	if (typeof text !== 'string') return undefined
	return planSplitFor(s, channelId, text)
}

/** The plan for [text] in [channelId]: the Send path hands these in from Discord's own call. */
export function planSplitFor(s: CharCounterStorage, channelId: string, text: string): SplitPlan | undefined {
	if (!s.split || !canWriteBox(channelId)) return undefined
	const max = limit()
	if (text.length <= max) return undefined
	const parts = splitMessage(text, max)
	if (parts.length < 2 || parts.length > maxPartsOf(s)) return undefined
	// Every part must fit Discord's real limit on its own: the splitter guarantees it, this checks it.
	if (parts.some(part => part.length === 0 || part.length > max)) return undefined
	return { channelId, text, parts, delayMs: Math.max(delaySecondsOf(s), slowmodeSeconds(channelId)) * 1000, reply: pendingReply(channelId) }
}

/** Plugin start: the Send hook, and the ways an operation gets cancelled. */
export function setupSplit(cleanup: PluginCleanupApi, settings: () => CharCounterStorage): void {
	cleanup(patchSend(settings))
	cleanup(() => cancelActive('plugin stopped'))
	try {
		const onLogout = () => cancelActive('signed out')
		Dispatcher.subscribe('LOGOUT', onLogout)
		cleanup(() => Dispatcher.unsubscribe('LOGOUT', onLogout))
	} catch (error) {
		reportError(`${TAG} could not watch for logout; an operation still stops when the user changes:`, error)
	}
}

/**
 * Discord's Send on a long message. `chatInputHandleSendText` is wrapped, not the length it
 * compares against: within the limit the original runs untouched. Over it, a plan that fits starts
 * the split (or shows the parts first, per the setting) and undefined goes back, which is what the
 * original returns after its alert; the chat input ignores the result either way. No plan: the
 * original runs and shows Discord's alert.
 */
function patchSend(settings: () => CharCounterStorage): () => void {
	return getModules(withProps<SendUtils>('chatInputHandleSendText', 'chatInputValidateContentLength'), exports => {
		const host = typeof exports?.chatInputHandleSendText === 'function' ? exports : (exports as any)?.default
		if (typeof host?.chatInputHandleSendText !== 'function') {
			reportError(`${TAG} chatInputHandleSendText is not a function on the module found; Send keeps Discord's alert`)
			return
		}
		return instead(host, 'chatInputHandleSendText', function (args, original) {
			try {
				const input = args[0]
				const text = input?.text
				const channelId = input?.params?.channel?.id
				if (typeof text === 'string' && typeof channelId === 'string' && text.length > limit()) {
					rememberChatInputRef(channelId, input?.params?.chatInputRef)
					const s = settings()
					const plan = planSplitFor(s, channelId, text)
					if (plan && messageActions()) {
						if (s.onSend === 'ask') openSplitSheet({ plan, start: () => runSplit(plan) })
						else {
							const operation = runSplit(plan)
							if (operation) openSplitSheet({ plan, start: () => operation, operation })
							else showToast('Another split is still sending.', TOAST)
						}
						return undefined
					}
				}
			} catch (error) {
				reportError(`${TAG} the Send hook failed; Discord's own check runs:`, error)
			}
			return Reflect.apply(original, this, args)
		})
	})
}

/** The square was tapped: plan again from the box's text right now and open the sheet. */
export function offerSplit(s: CharCounterStorage) {
	try {
		const plan = planSplit(s)
		if (!plan) {
			showToast('Nothing to split right now.', TOAST)
			return
		}
		if (!messageActions()) {
			// AS-02: without the host's own send there is no sending at all, and no other way is tried.
			showToast("Discord's send isn't available to this plugin on this build, so splitting is off.", TOAST)
			return
		}
		openSplitSheet({ plan, start: () => runSplit(plan) })
	} catch (error) {
		reportError(`${TAG} could not offer the split:`, error)
	}
}

let actions: MessageActions | undefined

/** Discord's message action creators, by path first, then by the three names together. */
function messageActions(): MessageActions | undefined {
	if (actions) return actions
	try {
		const byPath = (discordFinders as any).lookupModuleWithImportedPath?.('actions/MessageActionCreators.tsx')
		const mod = Array.isArray(byPath) ? byPath[0] : byPath
		const host = typeof mod?.sendMessage === 'function' ? mod : mod?.default
		if (typeof host?.sendMessage === 'function') return (actions = host)
	} catch {
		/* fall through to the props filter */
	}
	try {
		const [exports] = lookupModule(withProps<MessageActions>('sendMessage', 'editMessage', 'startEditMessage'))
		const host = typeof exports?.sendMessage === 'function' ? exports : (exports as any)?.default
		if (typeof host?.sendMessage === 'function') return (actions = host)
	} catch {
		/* none */
	}
	return undefined
}

/**
 * Starts the operation for [plan]. Returns it for the sheet to follow, or undefined when one is
 * already running (the sheet says so) or Discord's send is missing.
 */
export function runSplit(plan: SplitPlan): Operation | undefined {
	const send = messageActions()
	if (!send) return undefined
	const host: Host = {
		send: (part, index) => {
			// The reply strip goes just before the part that is the reply, as `chatInputSendMessage` does.
			if (index === 0 && plan.reply) deletePendingReply(plan.channelId)
			// The one call per part. Discord's own send: its nonce, its queue, its validation, its errors.
			return send.sendMessage(plan.channelId, { content: part, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, undefined, index === 0 ? replyOptions(plan, send) : {})
		},
		confirmed: result => {
			if (!result || typeof result !== 'object') return false
			const r = result as { ok?: unknown; status?: unknown; body?: { id?: unknown } }
			return r.ok === true || (typeof r.status === 'number' && r.status >= 200 && r.status < 300 && typeof r.body?.id === 'string')
		},
		currentUserId,
		sleep: (ms, cancelled) =>
			new Promise(resolve => {
				const started = Date.now()
				const tick = () => {
					if (cancelled() || Date.now() - started >= ms) resolve()
					else setTimeout(tick, Math.min(100, ms))
				}
				tick()
			}),
	}
	const operation = startOperation(host, plan.channelId, plan.parts, plan.delayMs)
	if (!operation) return undefined
	void operation.done.then(end => finish(plan, end))
	return operation
}

/**
 * The first part's options when a reply is being composed: Discord's own
 * `getSendMessageOptionsForReply(pendingReply)` (`messageReference`, `allowedMentions` only when
 * the @ toggle is off, `mediaMention`), with the same shape built by hand if that helper is gone.
 */
function replyOptions(plan: SplitPlan, actions: MessageActions): object {
	const id = plan.reply?.message?.id
	if (!id) return {}
	try {
		const options = actions.getSendMessageOptionsForReply?.(plan.reply)
		if (options && typeof options === 'object') return options
	} catch {
		/* built by hand below */
	}
	const guildId = plan.reply?.channel?.guild_id ?? guildIdOf(plan.channelId)
	return {
		messageReference: { guild_id: guildId, channel_id: plan.channelId, message_id: id },
		...(plan.reply?.shouldMention === false ? { allowedMentions: { parse: ['users', 'roles', 'everyone'], replied_user: false } } : {}),
	}
}

let replyActions: { deletePendingReply?(channelId: string): void } | null | undefined

function deletePendingReply(channelId: string) {
	try {
		if (replyActions === undefined) {
			const [exports] = lookupModule(withProps<{ deletePendingReply?: unknown; createPendingReply?: unknown; default?: any }>('deletePendingReply', 'createPendingReply'))
			const host = typeof exports?.deletePendingReply === 'function' ? exports : exports?.default
			replyActions = typeof host?.deletePendingReply === 'function' ? host : null
		}
		replyActions?.deletePendingReply?.(channelId)
	} catch (error) {
		reportError(`${TAG} could not clear the reply strip:`, error)
	}
}

/** After the operation: empty the box, or put back what was not sent, and say what happened. */
function finish(plan: SplitPlan, end: Progress) {
	try {
		if (end.outcome === 'sent') {
			if (!clearBox(plan)) showToast(`Sent ${end.total} messages, but the message box could not be emptied. Clear it yourself.`, TOAST)
			return
		}
		const left = plan.parts.slice(end.sent).join('\n\n')
		const stopped = end.stoppedAt ?? end.sent + 1
		const why = end.outcome === 'rejected' ? `Discord refused part ${stopped}` : end.outcome === 'uncertain' ? `Part ${stopped} wasn't confirmed` : `Stopped before part ${stopped}`
		if (!left) {
			showToast(`${why}. Everything else had been sent.`, TOAST)
			return
		}
		const box = currentText(plan.channelId)
		if (box !== undefined && box !== plan.text && box.trim() !== '') {
			showToast(`${why} (${end.reason ?? 'no detail'}). The message box has changed since, so it was left alone; ${end.total - end.sent} parts were not sent.`, TOAST)
			return
		}
		const restored = replaceText(plan.channelId, left) || saveDraft(plan.channelId, left)
		showToast(
			restored
				? `${why} (${end.reason ?? 'no detail'}). The rest is back in the message box.`
				: `${why} (${end.reason ?? 'no detail'}). ${end.total - end.sent} parts were not sent and could not be put back.`,
			TOAST,
		)
	} catch (error) {
		reportError(`${TAG} finishing the split failed:`, error)
	}
}

/** Empties the box after a full send, the way Discord's send handler does: handle first, then the draft. */
function clearBox(plan: SplitPlan): boolean {
	const box = currentText(plan.channelId)
	// Only the text that was sent is cleared; typing that happened meanwhile stays.
	if (box !== undefined && box !== plan.text) return true
	const cleared = replaceText(plan.channelId, '')
	saveDraft(plan.channelId, '')
	return cleared
}

let draftActions: DraftActions['saveDraft'] | null | undefined

function saveDraft(channelId: string, content: string): boolean {
	try {
		if (draftActions === undefined) {
			const [exports] = lookupModule(withProps<DraftActions>('saveDraft', 'clearDraft'))
			const host = typeof exports?.saveDraft === 'function' ? exports : exports?.default
			draftActions = host?.saveDraft?.bind(host) ?? null
		}
		if (draftActions) {
			draftActions(channelId, content, CHANNEL_MESSAGE)
			return true
		}
	} catch {
		/* fall through */
	}
	try {
		Dispatcher.dispatch({ type: 'DRAFT_CHANGE', channelId, draftType: CHANNEL_MESSAGE, draft: content })
		return true
	} catch (error) {
		reportError(`${TAG} could not save the draft:`, error)
		return false
	}
}
