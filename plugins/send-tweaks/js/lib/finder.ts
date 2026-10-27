import { lookupModules, waitForModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/**
 * Finds a module by props now or whenever it initializes, and hands it over once.
 *
 * `lookupModule` alone is one-shot over modules already initialized, and the message and reply
 * action creators are often not initialized at `start()` -- coding rule 3, and the exact bug
 * that kept Catch Up's slash command from registering. This pairs the lookup with a subscription
 * rather than using `getModules`, whose `max` is shared between its two halves.
 *
 * The export is checked on both the namespace and `default` (coding rule 3 again). `T` describes
 * the methods the caller will hook, so the host it gets back is typed.
 */
export function whenModule<T extends object>(
	props: [keyof T & string, ...(keyof T & string)[]],
	onFound: (host: T, id: number) => void,
): () => void {
	const [first, ...rest] = props
	const filter = withProps<T>(first, ...rest)

	let done = false
	const accept = (exports: unknown, id: number) => {
		if (done) return false
		const host = [
			exports,
			(exports as { default?: unknown } | undefined)?.default,
		].find(
			candidate =>
				typeof (candidate as Record<string, unknown> | undefined)?.[first] ===
				'function',
		) as T | undefined
		if (!host) return false
		done = true
		onFound(host, id)
		return true
	}

	for (const [exports, id] of lookupModules(filter)) {
		if (accept(exports, id)) return () => {}
	}

	// Declared first because the callback references it.
	let unsub: (() => void) | undefined
	unsub = waitForModules(filter, (exports, id) => {
		if (accept(exports, id)) unsub?.()
	})
	return () => unsub?.()
}
