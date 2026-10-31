import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { useChangelog } from '../../../../../shared/changelog'
import { DEFAULTS } from '../../index'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { ShowTagStorage } from '../../index'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: ShowTagStorage }>
>

export default function Settings({ api }: Props) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView } = ReactNative
	const { TableRowGroup, TableSwitchRow } = Design

	const { onlyUsername } = api.jsonStorage.use() ?? DEFAULTS

	return (
		<Page>
			<ScrollView>
				<TableRowGroup title="Display">
					<TableSwitchRow
						label="Only show usernames"
						subLabel="Replace the display name with the username instead of appending it."
						value={!!onlyUsername}
						onValueChange={value =>
							api.jsonStorage.set({ onlyUsername: value })
						}
					/>
				</TableRowGroup>
			</ScrollView>
		</Page>
	)
}
