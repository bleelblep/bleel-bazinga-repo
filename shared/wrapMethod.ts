/**
 * `instead` without `valenced.patcher`: replaces a method with a plain function that hands `hook`
 * the call's args and the method as it was, with the receiver as `this` (the same shape as an
 * `instead` hook, so a `function (this, args, original)` body moves over unchanged).
 *
 * ## Why not the patcher's `instead`
 *
 * Two `instead` hooks on one method can recurse forever: each saves the method as it was when it
 * was added as its "original", and if that was already a patcher proxy (because some plugin's
 * `before` or `after` came first), the last hook in the chain calls back into the first. Hit for
 * real on `RowManager.prototype.generate`, which Custom Timestamps and Ghost Log NG both changed
 * this way while half the repo `before`/`after`-hooks it ("Maximum call stack size exceeded" on the
 * chat screen; docs/debugging/api-contracts.md, "Two instead hooks on one method can recurse forever").
 *
 * A plain function is not a proxy, so a patcher hook added after it saves real code, and one added
 * before it is simply what it calls. Safe in any start order. Send Tweaks' `lib/wrap.ts` is the
 * same idea for a before-only hook.
 *
 * ## Undoing it
 *
 * If the method is still this wrapper, the original is put back. If something has wrapped it since,
 * removing it would drop their hook too, so the wrapper stays and just passes calls through.
 */
export function wrapMethod(
	host: any,
	key: string,
	hook: (this: any, args: any[], original: (...args: any[]) => any) => any,
): () => void {
	const original = host?.[key]
	if (typeof original !== 'function') return () => {}

	let active = true
	const wrapper = function (this: unknown, ...args: any[]) {
		if (!active) return original.apply(this, args)
		return hook.call(this, args, original)
	}
	host[key] = wrapper
	// A read-only property: nothing was installed, so there is nothing to undo.
	if (host[key] !== wrapper) return () => {}

	return () => {
		active = false
		if (host[key] === wrapper) host[key] = original
	}
}
