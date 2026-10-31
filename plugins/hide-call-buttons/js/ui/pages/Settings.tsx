import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { useChangelog } from '../../../../../shared/changelog'
import { DEFAULTS } from '../../settings'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { HideCallButtonsStorage } from '../../settings'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: HideCallButtonsStorage }>
>

/**
 * One group per place in Discord, and each switch says which button it hides and where that
 * button sits, so a profile button and a DM header button can't be mistaken for each other.
 */
export default function Settings({ api }: Props) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page, TableRowAssetIcon } = components
	const { ScrollView } = ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow } = Design

	const s = { ...DEFAULTS, ...api.jsonStorage.use() }
	const set = (patch: Partial<HideCallButtonsStorage>) =>
		api.jsonStorage.set(patch)

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Each switch hides one button in one place. Calls still work from
						everywhere else, and switching one off brings its button straight
						back.
					</Text>
					<TableRowGroup title="Someone's profile">
						<TableSwitchRow
							label="Hide the call button"
							subLabel="The phone button in the row of buttons under a person's name, on the profile that opens when you tap their name or picture."
							icon={<TableRowAssetIcon name="PhoneCallIcon" />}
							value={s.upHideVoiceButton}
							onValueChange={v => set({ upHideVoiceButton: v })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Top of a DM">
						<TableSwitchRow
							label="Hide the call button"
							subLabel="The phone icon at the top right of a DM or group DM, next to search."
							icon={<TableRowAssetIcon name="PhoneCallIcon" />}
							value={s.dmHideCallButton}
							onValueChange={v => set({ dmHideCallButton: v })}
						/>
						<TableSwitchRow
							label="Hide the video call button"
							subLabel="The camera icon at the top right of a DM or group DM, next to the phone icon."
							icon={<TableRowAssetIcon name="VideoIcon" />}
							value={s.dmHideVideoButton}
							onValueChange={v => set({ dmHideVideoButton: v })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Friends list">
						<TableSwitchRow
							label="Hide the call button"
							subLabel="The phone button at the right-hand end of each friend's row."
							icon={<TableRowAssetIcon name="PhoneCallIcon" />}
							value={s.friendsHideCallButton}
							onValueChange={v => set({ friendsHideCallButton: v })}
						/>
					</TableRowGroup>
					<TableRowGroup title="While you're in a voice channel">
						<TableSwitchRow
							label="Hide the camera button"
							subLabel="The button that turns your camera on, in the controls at the bottom of the voice channel screen."
							icon={<TableRowAssetIcon name="VideoIcon" />}
							value={s.hideVCVideoButton}
							onValueChange={v => set({ hideVCVideoButton: v })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
