import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { setupChangelog } from '../../../shared/changelog'
import { reportError, setReporter } from '../../../shared/report'
import { refreshBreaks, watchBreaks } from './breaks'
import { CHANGELOG } from './changelog'
import {
	configure,
	configureFeedback,
	configureFlight,
	DEFAULTS,
	expectFlight,
	feedback,
	migrateColors,
	migrateTimes,
	setChannel,
	settleFlight,
} from './native'
import { setStorage } from './state'
import { effectiveColors, onThemeChange, personPalette } from './theme'
import { patchTyping } from './typing/patch'
import { GROUP_DM, onSelectedChannel, selectedChannel } from './typing/stores'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import type { SpeechBubblesStorage } from './native'
import { stopUnlessAndroid } from '../../../shared/androidOnly'

export default plugin<{ jsonStorage: SpeechBubblesStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ jsonStorage, cleanup, plugin }) {
		// iOS: the native half never loads (shared/androidOnly.ts).
		if (stopUnlessAndroid(plugin, 'Speech Bubbles')) return
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		cleanup(() => setReporter(undefined))

		// Rows Discord already drew before the hook went in stay stock until they are re-bound, so
		// ask for a reload instead of showing a half-styled chat.
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))

		// JS owns the settings and the theme; native is told at start, on every settings write and
		// on every theme change. Kept from subscribe, not read off `cache`: the settings page writes
		// through another handle on the same file (as in live-markdown).
		let settings: SpeechBubblesStorage = {
			...DEFAULTS,
			...(jsonStorage.cache ?? {}),
		}
		// Older stored values to the current ones, run on what was actually read from the file.
		const migrate = (stored: Partial<SpeechBubblesStorage> | undefined) => {
			if (!stored) return
			// "tap", "toast" and friends to the current times.
			const times = migrateTimes(stored.times)
			if (stored.times !== undefined && times !== stored.times) {
				settings = { ...settings, times }
				jsonStorage.set({ times })
			}
			// The two colour switches (before 0.4.0) to the one colour choice.
			const colors = migrateColors(stored as never)
			if (colors) {
				settings = { ...settings, ...colors }
				jsonStorage.set(colors)
			}
		}
		// The sub-pages (Visual style, Colours, Message times) read and write through this.
		setStorage(jsonStorage)
		cleanup(() => setStorage(undefined))
		cleanup(registerPages())
		const push = () => {
			const colors = effectiveColors(settings)
			configure({
				everywhere: settings.everywhere,
				times: settings.times,
				tails: settings.tails,
				hideAvatars: settings.hideAvatars,
				perPerson: settings.perPerson,
				timeBreaks: settings.timeBreaks,
				invisibleInk: settings.invisibleInk,
				iosReactions: settings.iosReactions,
				// Retired in 0.5.32: reactions are back under the message.
				tapbackCorner: false,
				swipeTimes: settings.swipeTimes,
				hideNames: settings.hideNames,
				swipeNames: settings.swipeNames,
				custom: settings.colors === 'own',
				...colors,
				personColors: personPalette(settings, colors),
				personSource: settings.personPalette,
				personDark: settings.personDark,
				bubbleRadius: settings.bubbleRadius,
				bubbleOpacity: Math.min(Math.max(settings.bubbleOpacity, 30), 100) / 100,
				scrollColor: settings.scrollColor,
				editedLabel: settings.editedLabel,
				ownAvatar: settings.ownAvatar,
				ownName: settings.ownName,
				headerTimes: settings.headerTimes,
				ownTimeFirst: settings.ownTimeFirst ?? true,
				avatarShape: settings.avatarShape,
				scrollColorStrength:
					Math.min(Math.max(settings.scrollColorStrength ?? 50, 20), 100) / 50,
			})
			configureFeedback(settings)
		}
		// `load: true` doesn't await the read (coding rule 7), so `cache` can still be empty here.
		// Native and the migration then wait for the file instead of running on the defaults.
		let stopped = false
		cleanup(() => {
			stopped = true
		})
		const adopt = (stored: Partial<SpeechBubblesStorage> | undefined) => {
			if (stopped) return
			settings = { ...DEFAULTS, ...(stored ?? {}), ...pending }
			migrate(stored)
			push()
			configureFlight(settings)
		}
		// Writes heard before the file was read; kept on top of what the file says.
		let pending: Partial<SpeechBubblesStorage> = {}
		let loaded = jsonStorage.cache != null
		if (loaded) migrate(jsonStorage.cache as Partial<SpeechBubblesStorage>)
		else
			Promise.resolve((jsonStorage as any).get())
				.then((stored: Partial<SpeechBubblesStorage> | undefined) => {
					loaded = true
					adopt(stored)
				})
				.catch((error: unknown) => {
					loaded = true
					reportError('[SpeechBubbles] settings read failed:', error)
				})
		push()
		configureFlight(settings)
		cleanup(
			jsonStorage.subscribe(patch => {
				const p = patch as Partial<SpeechBubblesStorage>
				if (
					'sendAnimation' in p ||
					'sendStyle' in p ||
					'sendSpeed' in p ||
					'sendHaptic' in p
				)
					configureFlight({ ...settings, ...p })
				if (!loaded) pending = { ...pending, ...p }
				const before = settings.timeBreaks
				settings = {
					...settings,
					...(patch as Partial<SpeechBubblesStorage>),
				}
				push()
				if (settings.timeBreaks !== before) refreshBreaks()
			}),
		)
		cleanup(onThemeChange(push))

		// "Colour per person" needs to know a chat is a group before a second person shows up.
		cleanup(
			onSelectedChannel(channel =>
				setChannel(channel.id, !!channel.guild_id || channel.type === GROUP_DM),
			),
		)

		// Time breaks: which messages of the open channel follow a quiet gap.
		cleanup(watchBreaks(() => settings.timeBreaks))

		// Send animation: a plain listener (Dispatcher.subscribe), not a dispatch patch, so it runs
		// after Discord's stores have the message and can't change or drop the event. Your send first
		// arrives as an optimistic MESSAGE_CREATE whose id is the nonce; that id goes to native, which
		// flies the row bound for it. Read-only: nothing is sent, delayed, requested or stored.
		const flown = new Set<string>()
		const sounded = new Set<string>()
		const selfId = (): string | undefined => {
			const id = (Stores as any).UserStore?.getCurrentUser?.()?.id
			return id == null ? undefined : String(id)
		}
		// Only where bubbles are drawn: DMs and group DMs, or servers with "Show in servers" on.
		const bubblesIn = (channelId: unknown): boolean => {
			if (settings.everywhere) return true
			if (typeof channelId !== 'string') return false
			const channel = (Stores as any).ChannelStore?.getChannel?.(channelId)
			return !!channel && !channel.guild_id
		}
		const onMessage = (payload: {
			optimistic?: boolean
			channelId?: unknown
			message?: {
				id?: unknown
				nonce?: unknown
				channel_id?: unknown
				author?: { id?: unknown }
			}
		}) => {
			try {
				const message = payload?.message
				const id = message?.id
				if (typeof id !== 'string') return
				const author = message?.author?.id
				const channelId = payload.channelId ?? message?.channel_id
				// Someone else's message landing in the chat you have open: the receive sound.
				if (author != null && String(author) !== selfId()) {
					if (
						settings.sounds &&
						!payload.optimistic &&
						typeof channelId === 'string' &&
						channelId === selectedChannel()?.id &&
						bubblesIn(channelId)
					)
						feedback('receive', false)
					return
				}
				// Your send: the whoosh and tick, once per message (the optimistic copy).
				if (
					payload.optimistic &&
					(settings.sounds || settings.haptics) &&
					!sounded.has(id) &&
					bubblesIn(channelId)
				) {
					if (sounded.size > 50) sounded.clear()
					sounded.add(id)
					// The send animation already ticks when it lands.
					feedback('send', !(settings.sendAnimation && settings.sendHaptic))
				}
				if (!settings.sendAnimation) return
				if (payload.optimistic) {
					if (flown.has(id)) return
					if (!bubblesIn(payload.channelId ?? message?.channel_id)) return
					if (flown.size > 50) flown.clear()
					flown.add(id)
					expectFlight(id)
					return
				}
				const nonce = message?.nonce
				if (typeof nonce === 'string' && flown.has(nonce) && nonce !== id)
					settleFlight(nonce, id)
			} catch (error) {
				reportError('[SpeechBubbles] send watch failed:', error)
			}
		}
		;(Dispatcher as any).subscribe('MESSAGE_CREATE', onMessage)

		// Your reaction: a tick. Discord can report it twice (straight away, then from the server),
		// so the same reaction counts once within a few seconds.
		const reacted = new Map<string, number>()
		const onReaction = (payload: {
			userId?: unknown
			messageId?: unknown
			channelId?: unknown
			emoji?: { id?: unknown; name?: unknown }
		}) => {
			try {
				if (!settings.sounds && !settings.haptics) return
				if (payload?.userId == null || String(payload.userId) !== selfId()) return
				if (!bubblesIn(payload.channelId)) return
				const key = `${payload.messageId}:${payload.emoji?.id ?? payload.emoji?.name}`
				const now = Date.now()
				if (now - (reacted.get(key) ?? 0) < 5000) return
				if (reacted.size > 50) reacted.clear()
				reacted.set(key, now)
				feedback('react')
			} catch (error) {
				reportError('[SpeechBubbles] reaction watch failed:', error)
			}
		}
		;(Dispatcher as any).subscribe('MESSAGE_REACTION_ADD', onReaction)
		cleanup(() => (Dispatcher as any).unsubscribe('MESSAGE_REACTION_ADD', onReaction))
		cleanup(() => (Dispatcher as any).unsubscribe('MESSAGE_CREATE', onMessage))
		cleanup(() => configureFlight({ ...settings, sendAnimation: false }))

		// The typing bubble (JS only); it reads the settings at render, so the switch needs no reload.
		patchTyping(cleanup, () => settings)
	},
	SettingsComponent: Settings,
})
