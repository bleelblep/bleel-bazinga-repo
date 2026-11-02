import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import type { ReactNode } from 'react'
import { tokenHex } from '../../lib/colours'

/** Discord's warning yellow, used when the theme's token doesn't resolve. */
const FALLBACK = '#f0b232'

/**
 * The yellow card that says ready-made rules you added have fixes waiting. Shown at the top of a
 * rule list and of the ready-made screen, so an update is hard to miss. Tappable when `onPress` is
 * given (the rule list uses it to open the ready-made screen); the ready-made screen puts the rules
 * that need updating inside it.
 */
export default function UpdateBanner({
	title,
	body,
	onPress,
	children,
}: {
	title: string
	body: string
	onPress?: () => void
	/** Shown inside the card, under the text: the rules to update. */
	children?: ReactNode
}) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Pressable, View } = ReactNative
	const { Text } = Design
	const yellow =
		tokenHex('status-warning') ?? tokenHex('text-feedback-warning') ?? FALLBACK

	const card = (
		<View
			style={{
				borderRadius: 16,
				borderWidth: 1.5,
				borderColor: yellow,
				// About 13% of the yellow over the page, so the text stays readable on any theme.
				backgroundColor: `${yellow}22`,
				paddingHorizontal: 16,
				paddingVertical: 12,
				gap: 4,
			}}
		>
			<Text variant="text-md/bold" style={{ color: yellow }}>
				{title}
			</Text>
			<Text color="text-default" variant="text-sm/normal">
				{body}
			</Text>
			{children ? <View style={{ marginTop: 8 }}>{children}</View> : null}
		</View>
	)

	return onPress ? (
		<Pressable accessibilityRole="button" onPress={onPress}>
			{card}
		</Pressable>
	) : (
		card
	)
}
