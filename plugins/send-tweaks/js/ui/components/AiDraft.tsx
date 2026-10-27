import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { draftRule } from '../../lib/aiRule'
import { addRule, setEditing } from '../../lib/ruleStore'
import { getAi } from '../../lib/state'
import { FieldRow } from '../fieldGroup'
import { rowIcon } from '../icon'
import { EDIT_RULE_ROUTE } from '../routes'
import type { Draft } from '../../lib/aiRule'
import type { RuleKind } from '../../lib/ruleStore'
import type { Navigation } from '../navigation'

/**
 * "Describe a rule", written by AI Core (`lib/aiRule.ts`). Rendered only when AI Core is installed:
 * without it this returns nothing at all. Installed but unable to call (no key, or today's limit
 * used) shows the section greyed out with the reason, so it is clear why nothing happens.
 */
export default function AiDraft({ kind }: { kind: RuleKind }) {
	const { React } = react
	const { View } = ReactNative
	const { Text, Card, TableRowGroup, TableRow, TextInput } = Design
	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as Navigation

	const [description, setDescription] = React.useState('')
	const [busy, setBusy] = React.useState(false)
	const [draft, setDraft] = React.useState<Draft | undefined>()

	const ai = getAi()
	if (!ai) return null

	const links = kind === 'links'
	let available = false
	let remaining = ''
	try {
		available = ai.isAvailable()
		const budget = ai.budget()
		if (budget.unlimited || !Number.isFinite(budget.remaining))
			remaining = 'no daily limit'
		else
			remaining = `${budget.remaining} AI call${budget.remaining === 1 ? '' : 's'} left today`
	} catch {
		/* shown as unavailable */
	}

	const run = async () => {
		setBusy(true)
		setDraft(undefined)
		try {
			setDraft(await draftRule(kind, description))
		} finally {
			setBusy(false)
		}
	}

	const add = () => {
		if (!draft?.ok) return
		const rule = addRule(kind, { ...draft.rule })
		setDraft(undefined)
		setDescription('')
		setEditing(kind, rule.id)
		navigation.navigate(EDIT_RULE_ROUTE)
	}

	return (
		<View style={{ gap: 8 }}>
			<TableRowGroup hasIcons>
				<FieldRow
					label="Describe a rule"
					description={
						available
							? `Written by AI Core, one call per rule (${remaining}). Only this description is sent.`
							: "AI Core can't make calls right now: set a key in its settings, or today's limit is used up."
					}
				>
					<TextInput
						placeholder={
							links
								? 'e.g. make Instagram links embed properly'
								: 'e.g. replace omw with on my way'
						}
						value={description}
						multiline
						isClearable
						editable={available}
						onChange={(value: string) => setDescription(value)}
					/>
				</FieldRow>
				<TableRow
					label={busy ? 'Writing…' : 'Write the rule'}
					icon={rowIcon('MagicWandIcon')}
					disabled={!available || busy || !description.trim()}
					onPress={run}
				/>
			</TableRowGroup>

			{draft && !draft.ok ? (
				<Text color="text-feedback-warning" variant="text-sm/normal">
					{draft.error}
				</Text>
			) : null}

			{draft?.ok ? (
				<Card variant="secondary" border="none">
					<View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}>
						<Text color="text-default" variant="text-md/semibold">
							{draft.rule.name || 'New rule'}
						</Text>
						<Text color="text-muted" variant="text-sm/normal" selectable>
							{`Find${draft.rule.regex ? ' (regex)' : ''}: ${draft.rule.find}
Replace with: ${draft.rule.replace || '(removed)'}`}
						</Text>
						{draft.examples.length ? (
							draft.examples.map(example => (
								<Text
									key={example.input}
									color={example.pass ? 'text-muted' : 'text-feedback-warning'}
									variant="text-sm/normal"
									selectable
								>
									{example.pass
										? `✓ ${example.input} → ${example.got}`
										: `✗ ${example.input} → ${example.got} (expected ${example.expected})`}
								</Text>
							))
						) : (
							<Text color="text-feedback-warning" variant="text-sm/normal">
								No examples came back to test it with. Try it in Try a message
								first.
							</Text>
						)}
						<Text color="text-muted" variant="text-xs/normal">
							{draft.examples.some(example => !example.pass)
								? 'Some examples did not come out as expected, so this rule may not do what you asked.'
								: links
									? 'The examples pass here. The AI cannot check that the site it chose still exists, so check a link after sending one.'
									: 'The examples pass here.'}
						</Text>
					</View>
					<TableRow
						label="Add it"
						subLabel="Opens it so you can check or change it"
						icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon', 'ic_add_24px')}
						onPress={add}
					/>
					<TableRow
						label="Discard"
						icon={rowIcon('TrashIcon', 'ic_trash_24px')}
						onPress={() => setDraft(undefined)}
					/>
				</Card>
			) : null}
		</View>
	)
}
