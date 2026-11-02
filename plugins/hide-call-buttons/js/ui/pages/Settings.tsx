import { Credit } from '../../../../../shared/ui/credit'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { useChangelog } from '../../../../../shared/changelog'
import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
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
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow } = Design

	const s = { ...DEFAULTS, ...api.jsonStorage.use() }
	const set = (patch: Partial<HideCallButtonsStorage>) =>
		api.jsonStorage.set(patch)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Each switch hides one button in one place. Calls still work from
						everywhere else, and switching one off brings its button straight
						back.
					</Text>
					<TableRowGroup title="Someone's profile" hasIcons>
						<TableSwitchRow
							label="Hide the call button"
							subLabel="The phone button under their name, on the profile that opens when you tap them"
							icon={rowIcon('PhoneCallIcon', 'PhoneIcon')}
							value={s.upHideVoiceButton}
							onValueChange={v => set({ upHideVoiceButton: v })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Top of a DM or group DM" hasIcons>
						<TableSwitchRow
							label="Hide the call button"
							subLabel="The phone icon at the top right, next to search"
							icon={rowIcon('PhoneCallIcon', 'PhoneIcon')}
							value={s.dmHideCallButton}
							onValueChange={v => set({ dmHideCallButton: v })}
						/>
						<TableSwitchRow
							label="Hide the video call button"
							subLabel="The camera icon at the top right, next to the phone icon"
							icon={rowIcon('VideoIcon', 'CameraIcon')}
							value={s.dmHideVideoButton}
							onValueChange={v => set({ dmHideVideoButton: v })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Friends list" hasIcons>
						<TableSwitchRow
							label="Hide the call button"
							subLabel="The phone button at the end of each friend's row"
							icon={rowIcon('PhoneCallIcon', 'PhoneIcon')}
							value={s.friendsHideCallButton}
							onValueChange={v => set({ friendsHideCallButton: v })}
						/>
					</TableRowGroup>
					<TableRowGroup title="While you're in a voice channel" hasIcons>
						<TableSwitchRow
							label="Hide the camera button"
							subLabel="The button that turns your camera on, in the controls at the bottom"
							icon={rowIcon('VideoIcon', 'CameraIcon')}
							value={s.hideVCVideoButton}
							onValueChange={v => set({ hideVCVideoButton: v })}
						/>
					</TableRowGroup>
					<Credit author="John (janisslsm)" />
				</Stack>
			</ScrollView>
		</Page>
	)
}
