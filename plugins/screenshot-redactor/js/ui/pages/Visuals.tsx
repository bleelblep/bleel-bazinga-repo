import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { showToast as sharedToast } from '../../../../../shared/toast'
import { DEFAULTS } from '../../defaults'
import { aliasCount, resetAliases } from '../../lib/alias'
import { refreshChat } from '../../lib/chatRows'
import { getStorage } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { RedactionStyle, ScreenshotRedactorStorage } from '../../types'

// Read inside the component, never at module scope -- see docs/coding-rules.md rule 1.
function showToast(content: string) {
	sharedToast(content, 'ScreenshotRedactorToast')
}

const STYLE_OPTIONS: Array<{
	value: RedactionStyle
	label: string
	subLabel: string
	icons: string[]
}> = [
	{
		value: 'pseudonym',
		label: 'User 1, User 2…',
		subLabel:
			'Numbered in order of first appearance. The thread still reads as a conversation.',
		icons: ['UserIcon'],
	},
	{
		value: 'initial',
		label: 'U1, U2…',
		subLabel:
			'Same numbering, short enough not to reflow a narrow message header.',
		icons: ['PencilIcon', 'ic_edit'],
	},
	{
		value: 'block',
		label: '████████',
		subLabel: 'Obviously redacted, but everyone on screen looks identical.',
		icons: ['EyeSlashIcon'],
	},
]

/**
 * Everything that decides what redaction *looks like*, on its own route so the root page stays
 * an index. Rendered as a plain navigator route, so there's no plugin `api` prop here -- the
 * storage handle comes from `lib/state`, same as anti-ghost-ping's Options page.
 */
export default function Visuals() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView, Alert } = ReactNative
	const {
		Stack,
		TableRowGroup,
		TableSwitchRow,
		TableRow,
		TableRadioGroup,
		TableRadioRow,
	} = Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<ScreenshotRedactorStorage>) => storage?.set(patch)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRadioGroup
						title="Placeholder style"
						hasIcons
						defaultValue={s.style ?? DEFAULTS.style}
						onChange={(style: RedactionStyle) => {
							set({ style })
							refreshChat()
						}}
					>
						{STYLE_OPTIONS.map(option => (
							<TableRadioRow
								key={option.value}
								label={option.label}
								subLabel={option.subLabel}
								icon={rowIcon(...option.icons)}
								value={option.value}
							/>
						))}
					</TableRadioGroup>

					<TableRowGroup title="What gets covered" hasIcons>
						<TableSwitchRow
							label="Names everywhere, not just messages"
							subLabel="Also covers inline @mentions, the member list, profile sheets and the DM header — including the header avatar, which is resolved separately from the name beside it."
							icon={rowIcon('UserIcon')}
							value={!!s.redactResolvedNames}
							onValueChange={redactResolvedNames => {
								set({ redactResolvedNames })
								refreshChat()
							}}
						/>
						<TableSwitchRow
							label="Replace avatars"
							subLabel="Swaps in Discord's default avatars and drops avatar decorations and role icons. Avatars outside the message list follow the switch above."
							icon={rowIcon('ImageIcon', 'ic_image')}
							value={!!s.redactAvatars}
							onValueChange={redactAvatars => {
								set({ redactAvatars })
								refreshChat()
							}}
						/>
						<TableSwitchRow
							label="Hide server tags"
							subLabel="Also clears the server-tag badge beside usernames, which narrows down which server someone belongs to. An earlier attempt at this visibly broke the client — if chat looks wrong, turn it back off."
							icon={rowIcon('ShieldIcon', 'ic_shield')}
							value={!!s.redactBadges}
							onValueChange={redactBadges => {
								set({ redactBadges })
								refreshChat()
							}}
						/>
						<TableSwitchRow
							label="Redact me too"
							subLabel="It's usually your screenshot, and leaving yourself visible makes the thread easier to follow — turn this off if you want that."
							icon={rowIcon('EyeIcon')}
							value={!!s.redactSelf}
							onValueChange={redactSelf => {
								set({ redactSelf })
								refreshChat()
							}}
						/>
					</TableRowGroup>

					<TableRowGroup title="Numbering" hasIcons>
						<TableSwitchRow
							label="Restart numbering each time"
							subLabel="Start again from User 1 whenever redaction is switched on, so numbers can't be matched up between two screenshots."
							icon={rowIcon('RefreshIcon', 'ic_refresh')}
							value={!!s.resetNumberingOnEnable}
							onValueChange={resetNumberingOnEnable =>
								set({ resetNumberingOnEnable })
							}
						/>
						<TableRow
							label="Reset numbering now"
							subLabel={`${aliasCount()} ${aliasCount() === 1 ? 'person has' : 'people have'} been assigned a placeholder.`}
							icon={rowIcon('RefreshIcon', 'ic_refresh')}
							onPress={() => {
								Alert.alert(
									'Reset numbering',
									'Clear all placeholder assignments now?',
									[
										{ text: 'Cancel', style: 'cancel' },
										{
											text: 'Reset',
											style: 'destructive',
											onPress: () => {
												resetAliases()
												refreshChat()
												showToast('Numbering reset.')
											},
										},
									],
								)
							}}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
