import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { setupChangelog } from '../../../shared/changelog'
import { reportError, setReporter } from '../../../shared/report'
import { refreshBreaks, watchBreaks } from './breaks'
import { CHANGELOG } from './changelog'
import {
	configure,
	configureFlight,
	DEFAULTS,
	expectFlight,
	migrateColors,
	migrateTimes,
	setChannel,
	settleFlight,
} from './native'
import { setStorage } from './state'
import { effectiveColors, onThemeChange } from './theme'
import { patchTyping } from './typing/patch'
import { GROUP_DM, onSelectedChannel } from './typing/stores'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import type { SpeechBubblesStorage } from './native'

export default plugin<{ jsonStorage: SpeechBubblesStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ jsonStorage, cleanup, plugin }) {
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
		// Older stored values ("tap", "toast") to the current ones.
		const times = migrateTimes(settings.times)
		if (times !== settings.times) {
			settings = { ...settings, times }
			jsonStorage.set({ times })
		}
		// The two colour switches (before 0.4.0) to the one colour choice.
		const colors = migrateColors(jsonStorage.cache as never)
		if (colors) {
			settings = { ...settings, ...colors }
			jsonStorage.set(colors)
		}

		// The sub-pages (Visual style, Colours, Message times) read and write through this.
		setStorage(jsonStorage)
		cleanup(() => setStorage(undefined))
		cleanup(registerPages())
		const push = () =>
			configure({
				everywhere: settings.everywhere,
				times: settings.times,
				tails: settings.tails,
				hideAvatars: settings.hideAvatars,
				perPerson: settings.perPerson,
				timeBreaks: settings.timeBreaks,
				invisibleInk: settings.invisibleInk,
				iosReactions: settings.iosReactions,
				tapbackCorner: settings.tapbackCorner,
				swipeTimes: settings.swipeTimes,
				custom: settings.colors === 'own',
				...effectiveColors(settings),
				bubbleRadius: settings.bubbleRadius,
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
				if (!settings.sendAnimation) return
				const message = payload?.message
				const id = message?.id
				if (typeof id !== 'string') return
				const author = message?.author?.id
				if (author != null && String(author) !== selfId()) return
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
		cleanup(() => (Dispatcher as any).unsubscribe('MESSAGE_CREATE', onMessage))
		cleanup(() => configureFlight({ ...settings, sendAnimation: false }))

		// The typing bubble (JS only); it reads the settings at render, so the switch needs no reload.
		patchTyping(cleanup, () => settings)
	},
	SettingsComponent: Settings,
})
