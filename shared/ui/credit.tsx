import { Design } from '@valenced/discord/design'

/**
 * The "made by" line at the foot of a settings page: one small, muted, centred line with no row
 * or card around it, so it sits under the settings instead of reading as one of them.
 *
 * Call from inside a component's render: `valenced.*` is read here, so module scope is out
 * (docs/coding-rules.md rule 1).
 */
export function Credit() {
	const { Text } = Design as any
	return (
		<Text color="text-muted" variant="text-xs/normal" style={{ textAlign: 'center', opacity: 0.8 }}>
			Made by <Text color="text-muted" variant="text-xs/semibold">bleelblep</Text>
		</Text>
	)
}
