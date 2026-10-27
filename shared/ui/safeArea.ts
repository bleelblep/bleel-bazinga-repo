import * as ReactNativeSafeAreaContext from '@valenced/externals/react-native-safe-area-context'

/**
 * Bottom padding for a scrollable settings page, so the system gesture bar doesn't cover the
 * last card. Shared by every plugin's `js/ui/safeArea.ts`. `react-native-safe-area-context` is a
 * vendored external; if this build doesn't bundle it, the base padding alone still lifts the
 * content off the navbar.
 *
 * Called like a hook (`useSafeAreaInsets` is one), so call it unconditionally at the top of the
 * component, and only ever from a render -- see docs/coding-rules.md rule 1.
 */
export function useBottomPadding(base = 16): number {
	try {
		const mod = ReactNativeSafeAreaContext as any
		const insets = mod?.useSafeAreaInsets?.()
		if (typeof insets?.bottom === 'number') return insets.bottom + base
	} catch {
		/* fall through to the base padding */
	}
	return base
}
