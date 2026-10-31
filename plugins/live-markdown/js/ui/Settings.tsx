import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ScrollView, View } from 'react-native'
import { useChangelog } from '../../../../shared/changelog'
import { DEFAULTS, FORMATS } from '../native'
import { rowIcon } from './icon'
import { useBottomPadding } from './safeArea'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { LiveMarkdownStorage } from '../native'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: LiveMarkdownStorage }>
>

/** Writes go to `jsonStorage` only; `start()` hears them through subscribe and tells native. */
export default function Settings({ api: { jsonStorage } }: Props) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Stack, Text, TableRowGroup, TableSwitchRow } = Design

	const s: LiveMarkdownStorage = { ...DEFAULTS, ...(jsonStorage.use() ?? {}) }

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="How it works">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-muted" variant="text-sm/normal">
								In the message box, **bold**, *italics*, __underline__,
								~~strikethrough~~, ||spoilers||, `code`, headings, -# subtext,
								&gt; quotes and [masked](https://links) show styled as you type.
								Only the look changes: the message you send is exactly what you
								typed.
							</Text>
						</View>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Fade the symbols"
							subLabel="Dims the ** ` ~~ and other markers so the styled text stands out."
							icon={rowIcon('EyeIcon')}
							value={s.dimMarkers}
							onValueChange={dimMarkers => jsonStorage.set({ dimMarkers })}
						/>
						<TableSwitchRow
							label="Bigger headings"
							subLabel="# headings grow and -# subtext shrinks, like in chat. Off keeps every line the same size."
							icon={rowIcon('TextIcon')}
							value={s.headings}
							onValueChange={headings => jsonStorage.set({ headings })}
						/>
						<TableSwitchRow
							label="Code font"
							subLabel="Shows `code` and code blocks in a fixed-width font."
							icon={rowIcon('CodeIcon', 'SlashBoxIcon')}
							value={s.monoCode}
							onValueChange={monoCode => jsonStorage.set({ monoCode })}
						/>
					</TableRowGroup>

					<TableRowGroup
						title="Selection menu"
						description="Select text in the message box: these appear next to Copy and Paste (most under ⋮). Tap one again to undo it."
					>
						{FORMATS.map(format => (
							<TableSwitchRow
								key={format.id}
								label={format.label}
								subLabel={format.example}
								value={(s.menu ?? []).includes(format.id)}
								onValueChange={on => {
									const current = s.menu ?? []
									// Kept in menu order, whatever order they were switched on in.
									const menu = FORMATS.map(f => f.id).filter(id =>
										id === format.id ? on : current.includes(id),
									)
									// A list must replace, not merge: set() deep-merges arrays by index, so a shorter
									// one would keep old entries (coding rule 6). `s` carries the other keys along.
									jsonStorage.set({ ...s, menu }, true)
								}}
							/>
						))}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
