import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'

/**
 * Bottom padding for a scrollable settings page, so the system gesture bar doesn't cover the
 * last card. Shared by every plugin's `js/ui/safeArea.ts`. `react-native-safe-area-context` is a
 * vendored external; if this build doesn't bundle it, the base padding alone still lifts the
 * content off the navbar. It's the named export: the module namespace wraps it one level deeper,
 * and reading the namespace directly found nothing, so every page got the base padding only.
 * The window's own inset is the floor, because the hook can report 0 inside the settings stack.
 *
 * Called like a hook (`useSafeAreaInsets` is one), so call it unconditionally at the top of the
 * component, and only ever from a render -- see docs/coding-rules.md rule 1.
 */
export function useBottomPadding(base = 16): number {
	try {
		const { useSafeAreaInsets, initialWindowMetrics } = ReactNativeSafeAreaContext
		const hook = useSafeAreaInsets()?.bottom ?? 0
		const window = initialWindowMetrics?.insets?.bottom ?? 0
		return Math.max(hook, window) + base
	} catch {
		/* fall through to the base padding */
	}
	return base
}
