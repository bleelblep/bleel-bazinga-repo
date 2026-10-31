/**
 * Finds a `React.memo` component by the `displayName` Discord's compiler sets on the function it
 * wraps. `withName` can't see through a memo wrapper (coding rule 3); this is the filter Palm's
 * Better Chat Buttons uses for the same chat-input components.
 *
 * Checked in the 352.2 bundle: `modules/chat_input/native/ChatInput.tsx` and
 * `accessories/ChatInputCharCounter.tsx` both do `fn.displayName = '...'` and export `memo(fn)`.
 * Unlike Palm's filter this one does not require `type.length === 1`: the counter's function takes
 * two parameters there.
 */

import { createFilterGenerator } from '@valenced/modules/finders/filters'
import type {
	Filter,
	FilterGenerator,
	FilterScopes,
} from '@valenced/modules/finders/filters'
import type { FC, MemoExoticComponent } from 'react'

type WithMemoizedNamedExoticComponent = FilterGenerator<
	<P = object>(
		name: string,
	) => Filter<{
		Result: MemoExoticComponent<FC<P>>
		Scopes: [typeof FilterScopes.Initialized]
	}>
>

export const withMemoizedNamedExoticComponent = createFilterGenerator(
	([name], _, exports) =>
		typeof exports?.type === 'function' && exports.type.displayName === name,
	([name]) => `bleelblep.char-counter.memoizedNamedExoticComponent(${name})`,
) as WithMemoizedNamedExoticComponent
