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
}

/** One switch per square, the selected-server look, and the reload note. */
export default function Settings({ api }: { api: any }) {
	useChangelog()
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableSwitchRow, TableRadioGroup, TableRadioRow, TableRow } = Design as any
	const s = useSettings()
	const { React } = react
	const [, bump] = React.useState(0)
	React.useEffect(() => onHookStatus(() => bump(n => n + 1)), [])
	/** "3 of 4 hooked" per target, naming what's missing: the honest answer to "does it work here?". */
	const statusOf = (target: (typeof TARGETS)[number]) => {
		if (!target.components.length) return ''
		const rows = target.components.map(c => ({ name: c.path.split('/').pop()!.replace('.tsx', ''), ...(hookStatus.get(c.path) ?? { status: 'waiting' as const }) }))
		const hooked = rows.filter(r => r.status === 'hooked').length
		const missing = rows.filter(r => r.status !== 'hooked').map(r => `${r.name}${r.status === 'failed' ? ' (failed)' : ''}`)
		return hooked === rows.length ? `Hooked ${hooked} of ${rows.length}.` : `Hooked ${hooked} of ${rows.length}; not found yet: ${missing.join(', ')}.`
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Squares to undo" hasIcons>
						{TARGETS.map(target => (
							<TableSwitchRow
								key={target.id}
								label={target.label}
								subLabel={`${target.description} ${statusOf(target)}`}
								icon={rowIcon(...(ICONS[target.id] ?? ['SettingsIcon']))}
								value={Boolean(s[target.id])}
								onValueChange={(value: boolean) => update({ [target.id]: value } as any)}
							/>
						))}
					</TableRowGroup>

					<TableRadioGroup title="Selected server" value={s.selected} onChange={(selected: string) => update({ selected: selected as any })}>
						<TableRadioRow label="Classic" subLabel="Servers are round; the one you're in becomes a rounded square, like Discord before the redesign." value="classic" />
						<TableRadioRow label="Always round" subLabel="Every server stays a circle, selected or not." value="round" />
					</TableRadioGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Reload to apply"
							subLabel="The server list and chat bar read their shapes when they're built, so a change shows after a reload."
							icon={rowIcon('RefreshIcon', 'ic_refresh')}
							onPress={() => api?.plugin?.requireReload?.()}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
