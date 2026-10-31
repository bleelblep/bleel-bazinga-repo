import { useChangelog } from '../../../../shared/changelog'
import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { sendOptions, type Stats, stats } from '../lib/native'
import { type CirclesStorage, settings, update, useSettings } from '../lib/settings'
import { tokenCount } from '../lib/tokens'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'

const SWITCHES: Array<{ key: keyof CirclesStorage; label: string; description: string; icon: string[] }> = [
	{
		key: 'app',
		label: "Discord's screens",
		description: 'Buttons, the message box, the You bar, menus, cards, sheets, server icons and pictures.',
		icon: ['AppsIcon', 'SettingsIcon'],
	},
	{
		key: 'native',
		label: 'The chat',
		description: 'Messages are drawn natively: embeds, attachments, reactions, voice messages, mentions.',
		icon: ['ChatIcon'],
	},
	{
		key: 'ovals',
		label: 'Circles too',
		description: 'Avatars, status dots and round buttons become squares. Off: only rounded corners go sharp.',
		icon: ['UserIcon', 'CircleIcon'],
	},
]

/** One switch per area, live counts, and the reload note. */
export default function Settings({ api }: { api: any }) {
	useChangelog()
	const { React } = react
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableSwitchRow, TableRow } = Design as any
	const s = useSettings()
	const [counts, setCounts] = React.useState<Stats | undefined>()
	React.useEffect(() => {
		void stats().then(setCounts)
	}, [])
	const squares = Boolean((globalThis as any).__bleelblepSquares)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{squares ? (
						<TableRowGroup hasIcons>
							<TableRow
								label="Round Corners is on"
								subLabel="It rounds the same things this sharpens. Turn one of them off."
								icon={rowIcon('WarningIcon', 'CircleInformationIcon')}
							/>
						</TableRowGroup>
					) : null}

					<TableRowGroup title="Sharpen" hasIcons>
						{SWITCHES.map(item => (
							<TableSwitchRow
								key={item.key}
								label={item.label}
								subLabel={item.description}
								icon={rowIcon(...item.icon)}
								value={Boolean(s[item.key])}
								onValueChange={(value: boolean) => {
									update({ [item.key]: value } as Partial<CirclesStorage>)
									void sendOptions(settings())
									api?.plugin?.requireReload?.()
								}}
							/>
						))}
					</TableRowGroup>

					<TableRowGroup title="Working" hasIcons>
						<TableRow
							label={counts ? `${counts.hooks} native hooks in` : 'Native part not loaded'}
							subLabel={
								counts
									? `Corners removed so far: ${counts.app} in screens, ${counts.native} in the chat, ${counts.ovals} circles. ${tokenCount} corner tokens at 0.`
									: 'Without it only the corner tokens change. Reinstall the plugin.'
							}
							icon={rowIcon('CheckmarkLargeIcon', 'InfoIcon')}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
