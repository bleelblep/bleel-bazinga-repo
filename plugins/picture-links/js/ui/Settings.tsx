import { Credit } from '../../../../shared/ui/credit'
import { useChangelog } from '../../../../shared/changelog'
import { rowIcon } from '../../../../shared/ui/icon'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

/** No options: this page exists for the changelog (clock icon, "What's new" after an update). */
export default function Settings() {
	useChangelog()
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow } = Design as any

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup hasIcons>
						<TableRow
							label="Nothing to set up"
							subLabel="Tap a profile picture or banner to open it full size, with save and share. Long-press a server profile picture to see the main one."
							icon={rowIcon('ImageIcon', 'ic_image')}
						/>
					</TableRowGroup>
					<Credit />
				</Stack>
			</ScrollView>
		</Page>
	)
}
