import { setupChangelog } from '../../../shared/changelog'
import { setReporter } from '../../../shared/report'
import { CHANGELOG } from './changelog'
import { patchBadge } from './lib/badge'
import { patchCounter } from './lib/counter'
import { setupSplit } from './lib/sender'
import Settings from './ui/Settings'

export interface CharCounterStorage {
	/** `count`: "45 characters". `limit`: "45 / 4,000 characters". `left`: "3,955 characters left". Past the limit: "N characters over the limit". */
	show: 'count' | 'limit' | 'left'
	/** Which side of the message box the square floats above. */
	side: 'left' | 'right'
	/** Only once the message reaches 90% of the limit. */
	onlyNearLimit: boolean
	/** Text size in the square, in points. 12 is Discord's small text, what 0.1.3 drew. */
	fontSize: number
	/** Past the limit, the square offers to split the message; the parts are shown and sent on a tap (lib/sender.ts). */
	split: boolean
	/** Seconds between the parts. A channel's slowmode wins when it is longer. */
	splitDelaySec: number
	/** Never more parts than this; a longer message is not offered a split. */
	splitMax: number
	/** Send on a long message: `send` runs the split straight away, `ask` shows the parts first. */
	onSend: 'send' | 'ask'
}

export const FONT_SIZE = { min: 10, max: 20, default: 12 } as const
export const SPLIT_DELAY = { min: 0, max: 10, step: 0.5, default: 1 } as const
export const SPLIT_MAX = { min: 2, max: 10, default: 5 } as const

/** Also the fallback for every read: `load: true` doesn't wait for storage (coding rule 7). */
export const DEFAULTS: CharCounterStorage = {
	show: 'count',
	side: 'left',
	onlyNearLimit: false,
	fontSize: FONT_SIZE.default,
	split: true,
	splitDelaySec: SPLIT_DELAY.default,
	splitMax: SPLIT_MAX.default,
	onSend: 'send',
}

export default plugin<{ jsonStorage: CharCounterStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		cleanup(() => setReporter(undefined))

		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))
		// Kept from subscribe, not read off `cache`: the settings page can write through another
		// handle on the same file, whose writes this handle's cache never sees. subscribe hands
		// over each patch, from any handle. Read on every render, so changes show on the next
		// keystroke without a reload.
		let current: CharCounterStorage = {
			...DEFAULTS,
			...(jsonStorage.cache ?? {}),
		}
		const take = (patch: Partial<CharCounterStorage> | undefined) => {
			if (patch) current = { ...current, ...patch }
		}
		cleanup(
			jsonStorage.subscribe(patch =>
				take(patch as Partial<CharCounterStorage>),
			),
		)
		jsonStorage.get().then(take, () => {})
		const settings = () => current

		// Each one looks its module up and subscribes for it, so a late start works too.
		patchCounter(cleanup)
		patchBadge(cleanup, settings)
		setupSplit(cleanup, settings)
	},
	SettingsComponent: Settings,
})
