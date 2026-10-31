/**
 * Pocket Browser: a web browser in a "Web" tab of the emoji / GIF / sticker picker.
 *
 * - lib/picker.ts adds the tab (the way Sekai Stickers adds its own).
 * - ui/Panel.tsx is the tab: tab row, toolbar, and an empty view the page is put into.
 * - PocketBrowser.kt owns the WebViews, so pages outlive the picker, and saves the tabs for the
 *   next launch. lib/native.ts is the bridge.
 * - lib/links.ts optionally sends web links tapped in Discord to the tab.
 * - lib/store.ts keeps the settings and History.
 */

import { setupChangelog } from '../../../shared/changelog'
import { CHANGELOG } from './changelog'
import { patchChatInput } from './lib/chatInput'
import { patchAutoExpand } from './lib/expand'
import { patchLinks } from './lib/links'
import { connect, setHoldHandler } from './lib/native'
import { patchPicker, syncTabOrder } from './lib/picker'
import { DEFAULTS, type PocketBrowserStorage, setStorage } from './lib/store'
import Panel, { openHoldMenu } from './ui/Panel'
import patchViewerButton from './popout/viewerButton'
import { patchUpload } from './lib/upload'
import Settings from './ui/Settings'
import { reportError, setReporter } from '../../../shared/report'

const TAG = '[Pocket Browser]'

function attempt(cleanup: (fn: () => void) => void, what: string, install: () => () => void) {
	try {
		cleanup(install())
	} catch (error) {
		reportError(`${TAG} ${what} failed:`, error)
	}
}

export default plugin<{ jsonStorage: PocketBrowserStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		// Errors go to Valenced's plugin error list (shared/report.ts), not the log.
		setReporter(api.plugin)
		api.cleanup(() => setReporter(undefined))

		const { cleanup, jsonStorage } = api
		setStorage(jsonStorage)
		cleanup(() => setStorage(undefined))
		attempt(cleanup, 'changelog', () => setupChangelog(api, CHANGELOG))
		attempt(cleanup, 'native bridge', connect)
		// Holding a link or image in a page opens this menu.
		setHoldHandler(openHoldMenu)
		cleanup(() => setHoldHandler(undefined))
		attempt(cleanup, 'chat input lookup', patchChatInput)
		attempt(cleanup, 'auto expand', patchAutoExpand)
		attempt(cleanup, 'picker patch', () => patchPicker(Panel))
		attempt(cleanup, 'link patch', patchLinks)
		// The media viewer's pop-out button (merged in from Pop Out Player). At start: the viewer
		// header loads lazily, and its plain function export is only reachable before that.
		attempt(cleanup, 'viewer button', patchViewerButton)
		attempt(cleanup, 'upload lookup', patchUpload)
		// Storage loads without being awaited; once it has, hide the tab if it was switched off.
		const resync = setTimeout(syncTabOrder, 4000)
		cleanup(() => clearTimeout(resync))
	},

	SettingsComponent: Settings,
})
