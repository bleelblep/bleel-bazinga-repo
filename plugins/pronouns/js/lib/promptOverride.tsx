/**
 * The "set pronouns for this person" dialog: used from the message long-press sheet
 * (patches/messageSheet.tsx) and from the People settings page, so editing an override looks the
 * same from both entry points.
 *
 * Call from an event handler: `valenced.*` is read here, so module scope is out (coding rule 1).
 */

import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { reportError } from '../../../../shared/report'
import { textInput } from '../ui/textInput'
import { resolve } from './resolve'
import { settings, update } from './state'
import { showToast } from './toast'

const TAG = '[Pronouns]'

export function promptOverride(userId: string, name: string) {
	const { AlertModal, AlertActionButton } = Design
	const TextInput = textInput()
	const key = 'PronounsOverride'
	const existing = settings().overrides?.[userId]
	const current =
		typeof existing === 'string' ? existing : (resolve(userId)?.text ?? '')
	let value = current
	const save = () => {
		AlertActionCreators.dismissAlert(key)
		try {
			const text = value.trim()
			// update() redraws the recent rows (patches/chat.ts listens).
			update({ overrides: { ...settings().overrides, [userId]: text || null } })
			showToast(
				text ? `Pronouns for ${name} set.` : `Pronouns for ${name} cleared.`,
				'PronounsOverrideToast',
			)
		} catch (error) {
			reportError(`${TAG} saving the override failed:`, error)
		}
	}
	AlertActionCreators.openAlert(
		key,
		<AlertModal
			title={`Pronouns for ${name}`}
			content="What the badge next to their name shows. Leave empty to clear yours."
			extraContent={
				<TextInput
					defaultValue={current}
					placeholder="e.g. they/them"
					autoFocus
					autoCapitalize="none"
					autoCorrect={false}
					onChange={(text: string) => {
						value = text
					}}
					onSubmitEditing={save}
				/>
			}
			actions={
				<>
					<AlertActionButton text="Save" variant="primary" onPress={save} />
					{typeof existing === 'string' && (
						<AlertActionButton
							text="Clear"
							variant="destructive"
							onPress={() => {
								value = ''
								save()
							}}
						/>
					)}
					<AlertActionButton
						text="Cancel"
						variant="secondary"
						onPress={() => AlertActionCreators.dismissAlert(key)}
					/>
				</>
			}
		/>,
	)
}
