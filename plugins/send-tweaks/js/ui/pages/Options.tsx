import { updateClearUrls } from '../../lib/clearurls'
import { removeListed } from '../../lib/replyPeople'
import { getStorage, requireReload, useSettings } from '../../lib/state'
import { showToast } from '../../lib/toast'
import type { DiscordModules } from '@valenced/discord/types'
import type { ComponentProps } from 'react'

function toast(content: string) {
	showToast(content, { key: 'SendTweaksClearUrls' })
}

import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { confirmDestructive } from '../../../../../shared/ui/confirm'
import { FieldRow } from '../fieldGroup'
import { dangerIcon, rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { SendTweaksStorage } from '../../types'
import { DELAYS, delayMs } from '../../undo/state'

function SingleLineField({
	value,
	onChange,
	...props
}: {
	value: string
	onChange: (value: string) => void
} & Omit<
	ComponentProps<DiscordModules.Components.TextInput>,
	'value' | 'onChange'
>) {
	const { TextInput } = Design
	const [draft, setDraft] = React.useState(value ?? '')
	return (
		<TextInput
			{...props}
			value={draft}
			onChange={(next: string) => {
				setDraft(next)
				onChange(next)
			}}
		/>
	)
}

/**
 * Every switch, grouped by what it changes -- Ghost Log Native Beta's `Options.tsx` layout. The rule
 * lists and tools stay on the root index; this page is behaviour toggles only.
 */
export default function Options() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design
	const { TableRadioGroup, TableRadioRow } = Design as any

	const storage = getStorage()
	const s = useSettings()
	const set = (patch: Partial<SendTweaksStorage>) => storage?.set(patch)

	const [updating, setUpdating] = React.useState(false)
	const runUpdate = () => {
		setUpdating(true)
		updateClearUrls()
			.then(result =>
				toast(
					result.ok
						? `ClearURLs rules updated: ${result.count} sites`
						: `Couldn't update the ClearURLs rules (${result.error}). The old ones still apply.`,
				),
			)
			.finally(() => setUpdating(false))
	}
	const data = s.clearUrlsData
	const clearUrlsLine = data
		? `Community rules for ${data.providers.length} sites, on top of the built-in list. Updated ${new Date(data.updatedAt).toLocaleDateString()}.`
		: 'Adds the ClearURLs community rules for about 200 sites, and turns redirect links like google.com/url into where they really go. Downloads when first used.'
	// A greyed-out row says why (settings design guide §6).
	const NEEDS_TRACKING = 'Turn on Remove tracking from links to use this.'
	const polishLine = (text: string) =>
		s.polishWording ? text : `Turn on Polish wording to use this. ${text}`

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Sending" hasIcons>
						<TableSwitchRow
							label="Silent messages"
							subLabel={
								s.silentMessages
									? 'On - everything you send goes out as @silent. It still arrives, but nobody gets a notification.'
									: 'Send every message as @silent, so it arrives without notifying anyone. Same as typing @silent yourself.'
							}
							icon={rowIcon('BellSlashIcon', 'BellZIcon')}
							value={!!s.silentMessages}
							onValueChange={value => set({ silentMessages: value })}
						/>
						<TableSwitchRow
							label="Also apply when editing"
							subLabel="Clean links and apply your rules to messages you edit, not just new ones. The edit box opens already cleaned, so saving without changes still fixes an old message."
							icon={rowIcon('PencilIcon', 'ic_edit_24px')}
							value={!!s.applyToEdits}
							onValueChange={value => set({ applyToEdits: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Undo send" hasIcons>
						<TableSwitchRow
							label="Undo send"
							subLabel="After you press send, the message waits a few seconds with an Undo bar above the box. Tap it and the text is back in the box. Nobody sees the message until the wait ends."
							icon={rowIcon('ArrowAngleLeftUpIcon', 'ClockIcon', 'ic_clock')}
							value={!!s.undoSend}
							onValueChange={value => set({ undoSend: value })}
						/>
						<TableSwitchRow
							label="Hold photos and files too"
							subLabel={
								s.undoSend
									? 'Undo puts the photos and files back above the box too.'
									: 'Turn on Undo send to use this.'
							}
							icon={rowIcon('ImageIcon', 'AttachmentIcon', 'ic_image')}
							disabled={!s.undoSend}
							value={s.undoSendFiles !== false}
							onValueChange={value => set({ undoSendFiles: value })}
						/>
					</TableRowGroup>

					{s.undoSend ? (
						<TableRadioGroup
							key={`undo-delay-${s.undoSendDelay}`}
							title="Wait before sending"
							description="Switching apps, locking the phone, logging out or switching account cancels anything still waiting and puts it back in the box. Up to 3 wait at once; more send straight away."
							defaultValue={delayMs(s) / 1000}
							onChange={(undoSendDelay: number) => set({ undoSendDelay })}
						>
							{DELAYS.map(d => (
								<TableRadioRow key={d} label={`${d} seconds`} value={d} />
							))}
						</TableRadioGroup>
					) : null}

					<TableRowGroup title="Hold send and swipe up" hasIcons>
						<TableSwitchRow
							label="Message preview"
							subLabel={
								s.tapToPreview
									? 'Off while Tap send to preview is on: a tap already shows the preview.'
									: s.swipeSendUnchanged
										? 'Let go halfway up to see the message as it will be sent, then send it or close.'
										: 'Let go at the top to see the message as it will be sent, then send it or close.'
							}
							icon={rowIcon('EyeIcon', 'ic_eye')}
							disabled={!!s.tapToPreview}
							value={!!s.swipePreview && !s.tapToPreview}
							onValueChange={value => {
								set({ swipePreview: value })
								requireReload()
							}}
						/>
						<TableSwitchRow
							label="Send unchanged"
							subLabel="Let go at the top to send exactly as typed: no link cleaning, rules or @silent."
							icon={rowIcon('SendMessageIcon', 'ic_send')}
							value={!!s.swipeSendUnchanged}
							onValueChange={value => {
								set({ swipeSendUnchanged: value })
								requireReload()
							}}
						/>
					</TableRowGroup>

					<TableRowGroup title="Preview without holding" hasIcons>
						<TableSwitchRow
							label="Flick up to preview"
							subLabel={
								s.tapToPreview
									? 'Off while Tap send to preview is on: a tap already shows the preview.'
									: 'A quick flick up off send, no hold needed, shows the preview. Holding still works as above.'
							}
							icon={rowIcon('ArrowLargeUpIcon', 'EyeIcon')}
							disabled={!!s.tapToPreview}
							value={!!s.flickToPreview && !s.tapToPreview}
							onValueChange={value => {
								set({ flickToPreview: value })
								requireReload()
							}}
						/>
						<TableSwitchRow
							label="Tap send to preview"
							subLabel="Tapping send shows the preview first, then Send sends it. Use this if holding send doesn't work for you. Empty messages and / commands send straight away."
							icon={rowIcon('ScreenIcon', 'EyeIcon')}
							value={!!s.tapToPreview}
							onValueChange={value => {
								set({ tapToPreview: value })
								requireReload()
							}}
						/>
					</TableRowGroup>

					<TableRowGroup title="Links" hasIcons>
						<TableSwitchRow
							label="Remove tracking from links"
							subLabel="Strips things like ?si=, utm_source and fbclid that tell a site who shared the link and where. The link still goes to the same place."
							icon={rowIcon('ShieldIcon', 'LinkIcon')}
							value={!!s.cleanUrls}
							onValueChange={value => set({ cleanUrls: value })}
						/>
						<TableSwitchRow
							label="Use ClearURLs rules"
							subLabel={
								s.cleanUrls
									? clearUrlsLine
									: `${NEEDS_TRACKING} ${clearUrlsLine}`
							}
							icon={rowIcon('DownloadIcon', 'ic_download_24px')}
							disabled={!s.cleanUrls}
							value={!!s.clearUrlsRules}
							onValueChange={value => {
								set({ clearUrlsRules: value })
								if (value && !s.clearUrlsData) runUpdate()
							}}
						/>
						<TableRow
							label={
								updating
									? 'Updating ClearURLs rules…'
									: 'Update ClearURLs rules now'
							}
							subLabel={
								!s.cleanUrls
									? NEEDS_TRACKING
									: !s.clearUrlsRules
										? 'Turn on Use ClearURLs rules to use this.'
										: 'They also update themselves about once a week.'
							}
							icon={rowIcon('RefreshIcon', 'ic_refresh')}
							disabled={!s.cleanUrls || !s.clearUrlsRules || updating}
							onPress={runUpdate}
						/>
						<TableSwitchRow
							label="Rewrite links"
							subLabel="Your own link rules, like x.com to fixupx.com so they embed properly."
							icon={rowIcon('LinkIcon', 'ic_link')}
							value={!!s.linkRewrite}
							onValueChange={value => set({ linkRewrite: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Text" hasIcons>
						<TableSwitchRow
							label="Replace text as you send"
							subLabel="Your own find-and-replace rules, like fixing a word you always mistype or turning -> into →."
							icon={rowIcon('TextIcon', 'ic_edit_24px')}
							value={!!s.textReplace}
							onValueChange={value => set({ textReplace: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Polish wording" hasIcons>
						<TableSwitchRow
							label="Polish wording"
							subLabel="Small tidy-ups to every message, done on your phone. Links, mentions, emoji and code are never touched, and your own rules run after it."
							icon={rowIcon('MagicWandIcon', 'ic_star')}
							value={!!s.polishWording}
							onValueChange={value => set({ polishWording: value })}
						/>
						<TableSwitchRow
							label="Add apostrophes"
							subLabel={polishLine(
								"dont → don't, im → I'm, thats → that's. Words like its, ill and were are left alone.",
							)}
							icon={rowIcon('QuoteIcon', 'ChatIcon')}
							disabled={!s.polishWording}
							value={s.polishApostrophes !== false}
							onValueChange={value => set({ polishApostrophes: value })}
						/>
						<TableSwitchRow
							label="Capitalise sentences"
							subLabel={polishLine(
								'A capital at the start of each sentence, and i on its own becomes I. Words with a capital already, like iPhone, stay as typed.',
							)}
							icon={rowIcon('TextUppercaseIcon', 'ArrowLargeUpIcon', 'ExpandIcon')}
							disabled={!s.polishWording}
							value={s.polishCapitals !== false}
							onValueChange={value => set({ polishCapitals: value })}
						/>
						<TableSwitchRow
							label="End with a full stop"
							subLabel={polishLine(
								'Adds one when a message ends in a word. Some people read that as cold in casual chat.',
							)}
							icon={rowIcon('CheckmarkLargeIcon')}
							disabled={!s.polishWording}
							value={!!s.polishFullStop}
							onValueChange={value => set({ polishFullStop: value })}
						/>
						<FieldRow
							label="Never capitalise"
							description={polishLine(
								'Words to leave lower case at the start of a sentence, separated by commas.',
							)}
						>
							<SingleLineField
								placeholder="lol, brb, ngl"
								value={s.polishSkip ?? ''}
								editable={!!s.polishWording}
								onChange={(value: string) => set({ polishSkip: value })}
							/>
						</FieldRow>
					</TableRowGroup>

					<TableRowGroup title="Replies" hasIcons>
						<TableSwitchRow
							label="Don't ping when replying"
							subLabel="Replies start with the @ mention switched off. Tap @ above the chat box to turn it on for one reply."
							icon={rowIcon('ArrowAngleLeftUpIcon')}
							value={!!s.noReplyMention}
							onValueChange={value => set({ noReplyMention: value })}
						/>
					</TableRowGroup>

					{s.noReplyMention ? (
						<TableRadioGroup
							title="Who gets pinged"
							defaultValue={s.replyPingMode ?? 'except'}
							onChange={(replyPingMode: 'except' | 'only') => set({ replyPingMode })}
						>
							<TableRadioRow label="Nobody, except the people below" value="except" />
							<TableRadioRow label="Everyone, except the people below" value="only" />
						</TableRadioGroup>
					) : null}

					{s.noReplyMention ? (
						<TableRowGroup
							title={`People (${(s.replyPingPeople ?? []).length})`}
							hasIcons
						>
							{(s.replyPingPeople ?? []).length ? (
								(s.replyPingPeople ?? []).map(person => (
									<TableRow
										key={person.id}
										variant="danger"
										label={person.name}
										subLabel="Tap to remove"
										icon={dangerIcon('UserMinusIcon', 'TrashIcon')}
										onPress={() =>
											confirmDestructive({
												title: `Remove ${person.name}?`,
												body: 'They go back to the default for replies. You can add them again from one of their messages.',
												action: 'Remove',
												onConfirm: () => removeListed(person.id),
											})
										}
									/>
								))
							) : (
								<TableRow
									label="Nobody yet"
									subLabel="Long-press someone's message to add them."
									icon={rowIcon('UserPlusIcon', 'UserIcon')}
								/>
							)}
						</TableRowGroup>
					) : null}
				</Stack>
			</ScrollView>
		</Page>
	)
}
