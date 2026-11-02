/**
 * What every settings page shares: saving (with the native hand-off), the pickers the Pages page
 * opens, and the page frame. Split out of Settings.tsx when the settings became an index with
 * sub-pages (settings design guide §2.2).
 */

import * as components from '@valenced/components'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { pushSettings } from '../lib/native'
import { syncTabOrder } from '../lib/picker'
import { type PocketBrowserStorage, SEARCH_ENGINES, type SearchEngine, TEXT_ZOOMS, homeUrl, settings, toUrl, update } from '../lib/store'

/** A settings page: scrolls, clears the gesture bar, 24 between groups (guide §3.1). */
export function SettingsPage({ children }: { children: any }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack } = Design as any
	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>{children}</Stack>
			</ScrollView>
		</Page>
	)
}

/** Saves, and hands native the page settings when one of those changed. */
export function set(patch: Partial<PocketBrowserStorage>) {
	update(patch)
	if ('showTab' in patch) syncTabOrder()
	if (['javascript', 'desktop', 'restore', 'home', 'search', 'thirdPartyCookies', 'keepPlaying', 'pageNewTabs', 'darkPages', 'textZoom'].some(key => key in patch)) pushSettings()
}

export function pickSearch(current: SearchEngine) {
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators
	const key = 'PocketBrowserSearch'
	alerts.openAlert(
		key,
		<AlertModal
			title="Search with"
			actions={
				<>
					{(Object.keys(SEARCH_ENGINES) as SearchEngine[]).map(engine => (
						<AlertActionButton
							key={engine}
							text={SEARCH_ENGINES[engine].name}
							variant={engine === current ? 'primary' : 'secondary'}
							onPress={() => {
								alerts.dismissAlert(key)
								set({ search: engine })
							}}
						/>
					))}
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}

export function pickTextZoom(current: number) {
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators
	const key = 'PocketBrowserTextZoom'
	alerts.openAlert(
		key,
		<AlertModal
			title="Text size"
			content="How big text is on pages. Layouts that don't fit it may look off."
			actions={
				<>
					{TEXT_ZOOMS.map(zoom => (
						<AlertActionButton
							key={zoom}
							text={zoom === 100 ? '100% (normal)' : `${zoom}%`}
							variant={zoom === current ? 'primary' : 'secondary'}
							onPress={() => {
								alerts.dismissAlert(key)
								set({ textZoom: zoom })
							}}
						/>
					))}
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}

export function editHome(current: string) {
	const { AlertModal, AlertActionButton, TextInput } = Design as any
	const alerts = AlertActionCreators
	const key = 'PocketBrowserHome'
	let value = current
	const save = () => {
		alerts.dismissAlert(key)
		// Empty: follow the search engine (homeUrl).
		if (!value.trim()) return set({ home: '' })
		const url = toUrl(value)
		if (url && /^https?:/i.test(url)) set({ home: url })
	}
	alerts.openAlert(
		key,
		<AlertModal
			title="Home page"
			content="Where new tabs and the Home page button go. Leave it empty to use your search engine's page."
			extraContent={
				<TextInput
					defaultValue={current}
					placeholder={homeUrl({ home: '', search: settings().search })}
					autoFocus
					autoCapitalize="none"
					autoCorrect={false}
					keyboardType="url"
					onChange={(text: string) => (value = text)}
					onSubmitEditing={save}
				/>
			}
			actions={
				<>
					<AlertActionButton text="Save" variant="primary" onPress={save} />
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}
