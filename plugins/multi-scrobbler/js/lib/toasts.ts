import { showToast as showStockToast } from '../../../../shared/toast'

// Upstream called `ToastActionCreators.open({ key, content, icon })`, the pre-350.4 shape.
// On current Discord that stores an empty toast and the toast container crashes ("Cannot read
// property 'position' of undefined"). shared/toast.ts uses Discord's own current toast instead.
// It shows text only, so the icon argument is kept for the callers but not drawn.
//
// Each toast gets its own key, as upstream did: Discord drops a toast whose key is already on
// screen, so "Testing…" followed by the result would only ever show the first one.
let count = 0

export function showToast(content: string, _icon?: string) {
	count += 1
	showStockToast(content, `MultiScrobblerToast-${count}`)
}
