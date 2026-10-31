/**
 * Swaps the render function of a memoised component for [make]'s wrapper, whichever shape Discord
 * built it in:
 *
 * - `memo(forwardRef(render))` up to Discord 349: the function is `default.type.render`.
 * - `memo(render)` from Discord 350.2 alpha, which moved to React 19's ref-as-a-prop and dropped
 *   `forwardRef` across the app: the function is `default.type` itself.
 *
 * Checking only for `.render` (as 0.8.x did) finds nothing on 350.2 and quietly installs nothing.
 *
 * A plain property swap, not the patcher, so it can't join the patcher's two-`instead` recursion. A component already on
 * screen keeps the function it mounted with; the next one mounted (switching chats) gets the wrapper.
 * Returns the undo, or undefined when the export has neither shape.
 */
export function wrapRender(
	exports: any,
	make: (original: (...args: any[]) => any) => (...args: any[]) => any,
): (() => void) | undefined {
	const memo = exports?.default ?? exports
	const inner = memo?.type
	let host: any
	let key: 'render' | 'type'
	if (typeof inner?.render === 'function') {
		host = inner
		key = 'render'
	} else if (typeof inner === 'function') {
		host = memo
		key = 'type'
	} else {
		return undefined
	}

	const original = host[key]
	const wrapper = make(original)
	// React DevTools and error messages read the name; keep Discord's.
	try {
		Object.defineProperty(wrapper, 'displayName', { value: original.displayName ?? original.name, configurable: true })
	} catch {
		/* cosmetic */
	}
	host[key] = wrapper
	if (host[key] !== wrapper) return undefined
	return () => {
		if (host[key] === wrapper) host[key] = original
	}
}
