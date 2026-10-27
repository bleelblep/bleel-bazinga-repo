import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { makeSilent } from '../../lib/silent'
import { useSettings } from '../../lib/state'
import { transform } from '../../lib/transform'
import { FieldGroup } from '../fieldGroup'
import { useBottomPadding } from '../safeArea'

const EXAMPLES = [
	'https://youtu.be/dQw4w9WgXcQ?si=Abc123xyz',
	'look https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=3f9a2b',
	'https://x.com/user/status/123?s=20&t=Zk9q',
	'https://twitter.com/user/status/123 — a link rule can turn this into fxtwitter',
	'https://www.amazon.com/dp/B0ABC/ref=sr_1_3?keywords=mug&qid=1&sr=8-3',
	'`https://x.com/a?s=20` — inside code, left alone',
]

/**
 * A message in, exactly what would be sent out.
 * Runs the same `transform` the send hook runs, showing clearly what would be sent
 * and what caused the changes (replace as you type, replace as you send, or both).
 */
export default function TryIt() {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow, TextInput } = Design

	const s = useSettings()
	const [draft, setDraft] = React.useState('')

	const result = draft ? transform(draft) : undefined
	const silent =
		!!result && s.silentMessages && makeSilent(result.text) !== result.text

	const changes = !result
		? []
		: ([
				result.cleaned &&
					`${result.cleaned} tracking parameter${result.cleaned === 1 ? '' : 's'} removed`,
				result.rewritten &&
					`${result.rewritten} link${result.rewritten === 1 ? '' : 's'} rewritten`,
				result.liveReplaced &&
					`${result.liveReplaced} rule${result.liveReplaced === 1 ? '' : 's'} applied (replace as you type)`,
				result.sendReplaced &&
					`${result.sendReplaced} rule${result.sendReplaced === 1 ? '' : 's'} applied (replace as you send)`,
				!result.liveReplaced &&
					!result.sendReplaced &&
					result.replaced &&
					`${result.replaced} rule${result.replaced === 1 ? '' : 's'} applied`,
				result.polished && 'wording polished',
				silent && 'sent silently',
			].filter(Boolean) as string[])

	const summary = !result
		? undefined
		: result.text === draft
			? `Nothing would change — this would be sent exactly as typed${silent ? ', but silently' : ''}.`
			: changes.join('\n')

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<FieldGroup label="Message">
						<TextInput
							placeholder="Type or paste a message"
							value={draft}
							multiline
							isClearable
							onChange={setDraft}
						/>
					</FieldGroup>

					{result ? (
						<Card variant="secondary" border="none">
							<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
								<Text color="text-muted" variant="text-sm/semibold">
									Would be sent as
								</Text>
								<Text
									color="text-default"
									variant="text-md/normal"
									style={{ marginTop: 8 }}
								>
									{result.text}
								</Text>
								<Text
									color="text-muted"
									variant="text-sm/normal"
									style={{ marginTop: 8 }}
								>
									{summary}
								</Text>
							</View>
						</Card>
					) : null}

					<TableRowGroup title="Try one of these">
						{EXAMPLES.map(example => (
							<TableRow
								key={example}
								label={example}
								onPress={() => setDraft(example)}
							/>
						))}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
