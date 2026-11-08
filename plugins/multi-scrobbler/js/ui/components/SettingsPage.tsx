import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
import { useBottomPadding } from '../safeArea'

/**
 * The frame every settings page shares (settings design guide §3.1): bottom padding for the
 * gesture bar, and 24 between blocks.
 */
export function SettingsPage({ children }: { children: any }) {
	// Read per-render, never at module scope (coding rule 1).
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack } = Design as any

	return (
		<Page>
			<View style={{ flex: 1 }}>
				<ScrollView
					contentContainerStyle={{ paddingBottom: useBottomPadding() }}
				>
					<Stack spacing={24}>{children}</Stack>
				</ScrollView>
			</View>
		</Page>
	)
}
