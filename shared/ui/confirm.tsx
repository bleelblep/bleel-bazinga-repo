import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'

/**
 * Asks before a destructive action, in Discord's own alert dialog (`AlertModal`), with the action
 * in red above Cancel. For danger rows (docs/settings-design-guide.md §3.8 and checklist item 6).
 *
 * Call from an event handler: `valenced.*` is read here, so module scope is out (coding rule 1).
 */
export function confirmDestructive(options: {
	title: string
	body: string
	action: string
	onConfirm(): void
}) {
	openConfirm(options, 'destructive')
}

/** The same dialog for a non-destructive "are you sure" (turning on something experimental). */
export function confirmAction(options: { title: string; body: string; action: string; onConfirm(): void }) {
	openConfirm(options, 'primary')
}

function openConfirm(options: {
	title: string
	body: string
	action: string
	onConfirm(): void
}, variant: 'destructive' | 'primary') {
	const { AlertModal, AlertActionButton } = Design as any
	const Alerts = AlertActionCreators as any
	const key = `bleelblep-confirm-${Date.now()}`
	Alerts.openAlert(
		key,
		<AlertModal
			title={options.title}
			content={options.body}
			actions={
				<>
					<AlertActionButton
						text={options.action}
						variant={variant}
						onPress={() => {
							Alerts.dismissAlert(key)
							options.onConfirm()
						}}
					/>
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => Alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}
