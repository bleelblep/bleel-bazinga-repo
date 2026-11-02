import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'

/**
 * The "made by" line at the foot of a settings page: small, muted and centred, with no row or card
 * around it, so it sits under the settings instead of reading as one of them. The whole "Made by"
 * line is semibold.
 *
 * For a plugin someone else made and bleelblep ported, pass `author`: the line names them, and a
 * smaller "Ported by bleelblep" goes underneath (docs/plugin-branding.md, Credit).
 *
 * Call from inside a component's render: `valenced.*` is read here, so module scope is out
 * (docs/coding-rules.md rule 1).
 */
export function Credit({ author }: { author?: string } = {}) {
	const { Text } = Design as any
	const { View } = ReactNative
	return (
		<View style={{ alignItems: 'center', gap: 2, opacity: 0.8 }}>
			<Text
				color="text-muted"
				variant="text-sm/semibold"
				style={{ textAlign: 'center' }}
			>
				Made by {author ?? 'bleelblep'}
			</Text>
			{author ? (
				<Text
					color="text-muted"
					variant="text-xxs/normal"
					style={{ textAlign: 'center' }}
				>
					Ported by bleelblep
				</Text>
			) : null}
		</View>
	)
}
