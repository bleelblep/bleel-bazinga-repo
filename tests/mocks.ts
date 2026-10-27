/**
 * Gives the `@valenced/*` exports a test needs a real implementation. See tests/preload.ts for how
 * the stand-ins work. Returns a function that removes the implementation again.
 *
 * ```ts
 * const restore = mockValenced('@valenced/discord/flux', { Stores: { UserStore: { getCurrentUser: () => me } } })
 * try { ... } finally { restore() }
 * ```
 */

interface ValencedTestGlobals {
	__valencedMocks?: Map<string, Record<string, unknown>>
	__valencedRemock?: (specifier: string) => void
}

export function mockValenced(
	specifier: string,
	impl: Record<string, unknown>,
): () => void {
	const { __valencedMocks: impls, __valencedRemock: remock } =
		globalThis as ValencedTestGlobals
	if (!impls || !remock)
		throw new Error(
			'tests/preload.ts is not loaded. Run the tests with `bun test` from the repository root.',
		)
	const previous = impls.get(specifier)
	impls.set(specifier, { ...previous, ...impl })
	// Another test file may have replaced this module with its own mock. Put the stand-ins back,
	// which also updates the bindings of modules that already imported it.
	remock(specifier)
	return () => {
		if (previous) impls.set(specifier, previous)
		else impls.delete(specifier)
	}
}
