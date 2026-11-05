/**
 * Debug (DEBUG builds only, settings design guide §5.2): what native reports. Never message text
 * (BubbleStatus).
 */

import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { FieldRow } from '../../../../../shared/ui/fieldGroup'
import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { status } from '../../native'
import { useSettings } from '../../state'
import type { BubbleStatus } from '../../native'

function describe(st: BubbleStatus | undefined): string {
	if (!st) return 'The native side did not answer.'
	const colors = Object.entries(st.colors ?? {}).map(
		([key, hex]) => `${key}: ${hex} (${st.tokens?.[key] ?? '?'})`,
	)
	return [
		`Hooked: ${st.hooked ? 'yes' : 'no'}`,
		st.method ? `Method: ${st.method}` : '',
		`Bubble rows right now: ${st.styledRows}`,
		`Everywhere: ${st.everywhere ? 'on' : 'off'}, tails ${st.tails === false ? 'off' : 'on'}, own colours ${st.custom ? 'on' : 'off'}, avatars ${st.hideAvatars ? 'hidden' : 'shown'}`,
		`Link span types: ${st.linkSpanClasses ?? 0}, links recoloured: ${st.linkRecolours ?? 0}`,
		`Own avatars hidden again: ${st.ownAvatarsRehidden ?? 0}`,
		`Times: ${st.times ?? '?'}, ${st.tapToggles ?? 0} taps, ${st.popupsShown ?? 0} pop-ups (id getter: ${st.messageIdGetter ?? 'none'})`,
		`Taps: ${st.rowTouchDowns ?? 0} touches, ${st.rowTapsSeen ?? 0} plain taps${st.lastTapSkip ? `, last skipped: ${st.lastTapSkip}` : ''}`,
		...colors,
		st.positions
			? `Positions seen: ${Object.entries(st.positions)
					.map(([k, n]) => `${k} ${n}`)
					.join(', ')}`
			: '',
		st.seenTypes?.length
			? `Message types seen: ${st.seenTypes.join(', ')}`
			: '',
		st.error ? `Last error: ${st.error}` : '',
	]
		.filter(Boolean)
		.join('\n')
}

export default function Debug() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Stack, Text, TableRowGroup, TableRow } = Design
	const s = useSettings()
	const [diag, setDiag] = useState('Checking…')
	const check = () => {
		status().then(st => setDiag(describe(st)))
	}
	// Again after each settings change, once native has been told.
	useEffect(() => {
		const t = setTimeout(check, 300)
		return () => clearTimeout(t)
	}, [JSON.stringify(s)])

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Native status" hasIcons>
						<FieldRow label="Status">
							<Text variant="text-sm/normal" color="text-default">
								{diag}
							</Text>
						</FieldRow>
						<TableRow
							label="Check again"
							icon={rowIcon('RefreshIcon', 'ic_refresh')}
							onPress={check}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
