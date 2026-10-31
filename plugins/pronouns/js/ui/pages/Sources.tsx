/** Source priority and filtering, separate from the root index. */

import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { FieldGroup } from '../../../../../shared/ui/fieldGroup'
import { rowIcon } from '../../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../../shared/ui/safeArea'
import { update, useSettings } from '../../lib/state'
import { textInput } from '../textInput'

export default function Sources() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow } = Design
	const s = useSettings()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Pronouns you set for someone take priority over both sources.
					</Text>

					<TableRowGroup title="Sources" hasIcons>
						<TableSwitchRow
							label="Also check PronounDB"
							subLabel="Use pronoundb.org as an additional source of pronouns."
							icon={rowIcon('GlobeEarthIcon', 'CompassIcon')}
							value={s.pronounDbEnabled}
							onValueChange={(pronounDbEnabled: boolean) =>
								update({ pronounDbEnabled })
							}
						/>
						{s.pronounDbEnabled && (
							<TableSwitchRow
								label="Discord pronouns first"
								subLabel="Off asks PronounDB before the person's own Discord profile."
								icon={rowIcon('PencilIcon', 'CompassIcon')}
								value={s.discordFirst}
								onValueChange={(discordFirst: boolean) =>
									update({ discordFirst })
								}
							/>
						)}
					</TableRowGroup>

					<TableRowGroup title="Clean up" hasIcons>
						<TableSwitchRow
							label="Only real pronouns"
							subLabel="Shows just the pronouns from a profile (“he/him 🌈 | 19” → “he/him”) and hides fields with none. Includes neopronouns."
							icon={rowIcon('FilterIcon', 'CheckmarkLargeIcon')}
							value={s.validOnly}
							onValueChange={(validOnly: boolean) => update({ validOnly })}
						/>
						{s.validOnly && (
							<TableSwitchRow
								label="Count Any and All"
								subLabel="“any”, “all”, “any pronouns” show as pronouns."
								icon={rowIcon('GlobeEarthIcon', 'CompassIcon')}
								value={s.allowAnyAll}
								onValueChange={(allowAnyAll: boolean) =>
									update({ allowAnyAll })
								}
							/>
						)}
					</TableRowGroup>
					{s.validOnly && <ExtraWords extraPronouns={s.extraPronouns} />}
				</Stack>
			</ScrollView>
		</Page>
	)
}

/** Extra words accepted by the pronoun filter. */
function ExtraWords({ extraPronouns }: { extraPronouns: string }) {
	const TextInput = textInput()
	const [extra, setExtra] = React.useState(extraPronouns)
	return (
		<FieldGroup
			label="Also allow"
			description="Extra pronoun words to accept, separated by spaces or slashes."
		>
			<TextInput
				placeholder="moth/moths star"
				value={extra}
				autoCapitalize="none"
				autoCorrect={false}
				onChange={(text: string) => {
					setExtra(text)
					update({ extraPronouns: text })
				}}
			/>
		</FieldGroup>
	)
}
