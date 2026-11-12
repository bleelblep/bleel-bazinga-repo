import { Credit } from '../../../../shared/ui/credit'
import { useChangelog } from '../../../../shared/changelog'
import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { hookStatus, onHookStatus } from '../lib/hook'
import { update, useSettings } from '../lib/settings'
import * as react from '@valenced/react'
import { TARGETS } from '../lib/targets'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

const ICONS: Record<string, string[]> = {
	serverIcons: ['ServerIcon', 'ic_server'],
	serverBarButtons: ['PlusLargeIcon', 'CompassIcon'],
	youBar: ['UserIcon'],
	chatButtons: ['SendMessageIcon', 'ChatIcon'],
	chatInput: ['ChatIcon', 'TextIcon'],
	youNav: ['UserIcon', 'SettingsIcon'],
	otherCorners: ['SparklesIcon', 'MagicWandIcon'],
	containerCorners: ['WindowLaunchIcon', 'ImageIcon', 'SettingsIcon'],
}

/**
 * One page (settings design guide §2.1): a warning while Sharp Corners is on, one switch per
 * square, the selected-server look, then whether each part was found. Changes offer the reload.
 */
export default function Settings({ api }: { api: any }) {
	useChangelog()
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableSwitchRow, TableRadioGroup, TableRadioRow, TableRow } = Design as any
	const s = useSettings()
	const { React } = react
	const [, bump] = React.useState(0)
	React.useEffect(() => onHookStatus(() => bump(n => n + 1)), [])
	// Whether the parts of Discord each switch changes were found: one status row, not a line under
	// every switch (settings design guide §5: status is for diagnosing, not everyday settings).
	const rows = TARGETS.flatMap(target =>
		target.components.map(c => ({
			name: c.path.split('/').pop()!.replace('.tsx', ''),
			...(hookStatus.get(c.path) ?? { status: 'waiting' as const }),
		})),
	)
	const hooked = rows.filter(r => r.status === 'hooked').length
	const missing = rows.filter(r => r.status !== 'hooked').map(r => `${r.name}${r.status === 'failed' ? ' (failed)' : ''}`)
	// Sharp Corners publishes this while it runs; the two undo each other.
	const sharp = Boolean((globalThis as any).__bleelblepSharp)
	/** Saves, then offers Valenced's reload: the shapes are read when things are built (guide §3.10). */
	const change = (patch: Record<string, unknown>) => {
		update(patch as any)
		api?.plugin?.requireReload?.()
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{sharp ? (
						<TableRowGroup hasIcons>
							<TableRow
								label="Sharp Corners is on"
								subLabel="It sharpens the same things this rounds. Turn one of them off."
								icon={rowIcon('WarningIcon', 'CircleInformationIcon')}
							/>
						</TableRowGroup>
					) : null}

					<TableRowGroup title="Squares to undo" hasIcons>
						{TARGETS.map(target => (
							<TableSwitchRow
								key={target.id}
								label={target.label}
								subLabel={target.description}
								icon={rowIcon(...(ICONS[target.id] ?? ['SettingsIcon']))}
								value={Boolean(s[target.id])}
								onValueChange={(value: boolean) => change({ [target.id]: value })}
							/>
						))}
						<TableSwitchRow
							label="You bar: just icons"
							subLabel="No square or circle behind the You bar's buttons, only the icons."
							icon={rowIcon('EyeSlashIcon', 'UserIcon')}
							value={Boolean(s.youBarIconsOnly)}
							onValueChange={(value: boolean) => change({ youBarIconsOnly: value })}
						/>
					</TableRowGroup>

					<TableRadioGroup key={`selected-${s.selected}`} title="Selected server" defaultValue={s.selected} onChange={(selected: string) => change({ selected })}>
						<TableRadioRow label="Classic" subLabel="Servers are round; the one you're in becomes a rounded square, like Discord before the redesign." value="classic" />
						<TableRadioRow label="Always round" subLabel="Every server stays a circle, selected or not." value="round" />
					</TableRadioGroup>

					<TableRowGroup title="Status" hasIcons>
						<TableRow
							label={hooked === rows.length ? 'Everything found' : `Found ${hooked} of ${rows.length} parts`}
							subLabel={
								hooked === rows.length
									? 'Every part of Discord these switches change was found on this version.'
									: `Not found yet: ${missing.join(', ')}. Some only load once you open them.`
							}
							icon={rowIcon(hooked === rows.length ? 'CheckmarkLargeIcon' : 'CircleInformationIcon', 'InfoIcon')}
						/>
					</TableRowGroup>
					<Credit />
				</Stack>
			</ScrollView>
		</Page>
	)
}
