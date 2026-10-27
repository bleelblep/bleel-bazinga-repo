import type { ReactNode } from 'react'

/** A component's render function, as the patcher sees it. */
export type RenderFunction<P = unknown> = (
	this: unknown,
	props: P,
	ref?: unknown,
) => ReactNode

/** The object and key that hold a render function, ready for `before`, `after` or `instead`. */
export interface RenderHost<P = unknown> {
	host: Record<string, RenderFunction<P>>
	key: 'render' | 'type'
}

/**
 * Where a memoised component keeps its render function, whichever shape Discord built it in:
 *
 * - `memo(forwardRef(render))` up to Discord 349: the function is `default.type.render`.
 * - `memo(render)` from Discord 350.2 alpha, which moved to React 19's ref-as-a-prop and dropped
 *   `forwardRef` across the app: the function is `default.type` itself.
 *
 * Checking only for `.render` (as 0.8.x did) finds nothing on 350.2 and quietly installs nothing.
 * Returns undefined when the export has neither shape.
 */
export function renderHost<P = unknown>(
	exports: unknown,
): RenderHost<P> | undefined {
	const memo = ((exports as { default?: unknown } | undefined)?.default ??
		exports) as { type?: unknown } | undefined
	const inner = memo?.type
	if (
		inner &&
		typeof inner === 'object' &&
		typeof (inner as { render?: unknown }).render === 'function'
	)
		return { host: inner as Record<string, RenderFunction<P>>, key: 'render' }
	if (typeof inner === 'function')
		return { host: memo as Record<string, RenderFunction<P>>, key: 'type' }
	return undefined
}
