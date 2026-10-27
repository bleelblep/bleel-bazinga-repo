/**
 * ReviewDB's own links (desktop's settings buttons) and the attribution, on their own route so
 * the root page stays an index.
 */

import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { openURL } from '../../lib/discord'
import { getToken } from '../../lib/state'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

export default function About() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow } = Design as any

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="ReviewDB" hasIcons>
						<TableRow
							label="Website"
							subLabel="Your dashboard, appeals and reports. Opens signed in if you are."
							icon={rowIcon('GlobeEarthIcon')}
							arrow
							onPress={() => {
								const token = getToken()
								let url = 'https://reviewdb.mantikafasi.dev'
								if (token) url += `/api/redirect?token=${encodeURIComponent(token)}`
								openURL(url)
							}}
						/>
						<TableRow
							label="Support server"
							subLabel="ReviewDB's own Discord server."
							icon={rowIcon('ServerIcon')}
							arrow
							onPress={() => openURL('https://discord.gg/eWPBSbvznt')}
						/>
						<TableRow
							label="Support development"
							subLabel="mantikafasi's GitHub Sponsors page."
							icon={rowIcon('HeartIcon')}
							arrow
							onPress={() => openURL('https://github.com/sponsors/mantikafasi')}
						/>
					</TableRowGroup>

					<TableRowGroup title="Licence">
						<TableRow label="ReviewDB for Valenced" subLabel="GPL-3.0, as a port of Vencord's plugin." />
						<TableRow
							label="Original plugin"
							subLabel="ReviewDB by mantikafasi and Vendicated, in Vencord (GPL-3.0). See this plugin's NOTICE.md."
						/>
						<TableRow
							label="Mobile sign-in approach"
							subLabel="Follows ra1ncord/rain's ReviewDB plugin (MPL-2.0). No code copied."
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
