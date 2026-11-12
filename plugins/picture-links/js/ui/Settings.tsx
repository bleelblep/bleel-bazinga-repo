import { Credit } from '../../../../shared/ui/credit'
import { useChangelog } from '../../../../shared/changelog'
import { rowIcon } from '../../../../shared/ui/icon'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { update, useSettings } from '../lib/settings'

/** One option, plus the changelog (clock icon, "What's new" after an update). */
export default function Settings() {
	useChangelog()
	const s = useSettings()
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design as any

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup hasIcons>
						<TableRow
							label="How it works"
							subLabel="Tap a profile picture or banner to open it full size, with save and share. Long-press a server profile picture to see the main one."
							icon={rowIcon('ImageIcon', 'ic_image')}
						/>
					</TableRowGroup>
					<TableRowGroup title="Animated pictures" hasIcons>
						<TableSwitchRow
							label="Full size animated pictures"
							subLabel="Open animated server icons, avatars and banners at the full 4096px instead of 1024px. Much heavier: the app can freeze for a few seconds while one plays."
							icon={rowIcon('GifIcon', 'ic_gif')}
							value={Boolean(s.fullSizeAnimated)}
							onValueChange={(value: boolean) =>
								update({ fullSizeAnimated: value })
							}
						/>
					</TableRowGroup>
					<Credit />
				</Stack>
			</ScrollView>
		</Page>
	)
}
