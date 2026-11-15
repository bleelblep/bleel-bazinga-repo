import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { useChangelog } from '../../../../../shared/changelog'
import { Credit } from '../../../../../shared/ui/credit'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
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
	const { Stack, TableRowGroup, TableSwitchRow } = Design

	const { onlyUsername, smallTag, below } = {
		...DEFAULTS,
		...(api.jsonStorage.use() ?? {}),
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Display">
						<TableSwitchRow
							label="Only show usernames"
							subLabel="Replace the display name with the username instead of appending it."
							value={!!onlyUsername}
							onValueChange={value =>
								api.jsonStorage.set({ onlyUsername: value })
							}
						/>
						<TableSwitchRow
							label="Small and dim"
							subLabel={
								onlyUsername
									? 'Not used while only usernames are shown.'
									: 'Show the username in small, dim text after the name, instead of in brackets. Replies and bots keep the brackets, and so do names with a Staff Tags or Pronouns tag on iOS.'
							}
							value={!!smallTag}
							disabled={!!onlyUsername}
							onValueChange={value => api.jsonStorage.set({ smallTag: value })}
						/>
						{smallTag && !onlyUsername ? (
							<TableSwitchRow
								label="Below the name"
								subLabel="Put the username on its own line under the name. Android only; on iOS it stays next to the name. Restart Discord after updating Show Tag."
								value={!!below}
								onValueChange={value => api.jsonStorage.set({ below: value })}
							/>
						) : null}
					</TableRowGroup>
					<Credit author="Cynosphere" />
				</Stack>
			</ScrollView>
		</Page>
	)
}
