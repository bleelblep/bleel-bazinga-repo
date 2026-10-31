/**
 * The length feed: Discord's own `ChatInputCharCounter`
 * (`modules/chat_input/native/accessories/ChatInputCharCounter.tsx`).
 *
 * On every change to the text, the chat input's `handleSelectionOrTextChange` calls
 * `chatInputCharCounter.current.onMessageLengthChanged(text.length)`. Discord's counter exposes that
 * method through `useImperativeHandle` and turns it into "how far over the limit"; over the limit it
 * draws a red `-N` inside the message box, under the text.
 *
 * The render is replaced so Discord's ref goes through ours: when its handle arrives, its
 * `onMessageLengthChanged` is wrapped to pass the length on (`lib/length.ts`), then the handle is
 * handed back. So the count updates on every keystroke, with no polling. Discord's own drawing is
 * dropped: the square above the message box (`lib/badge.tsx`) shows the count, and turns red past
 * the limit, in one place. (0.1.0 drew the count in Discord's slot, a centred row under the text
 * that made the box taller.)
 *
 * The component is `memo(fn)` and the ref arrives as `props.ref` (Discord dropped `forwardRef`
 * app-wide in 350.2, and the manifest requires 350.4 or newer), so the memo's `type` is the target.
 */

import { getModules } from '@valenced/modules/finders'
import { instead } from '@valenced/patcher'
import { useCallback, useEffect } from 'react'
import { withMemoizedNamedExoticComponent } from './filters'
import { setLength } from './length'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { Ref } from 'react'

interface CharCounterHandle {
	onMessageLengthChanged(length: number): void
}

interface CharCounterProps {
	ref?: Ref<CharCounterHandle>
}

/** Handles whose `onMessageLengthChanged` already passes the length on. */
const wrapped = new WeakSet<CharCounterHandle>()

export function patchCounter(cleanup: PluginCleanupApi): void {
	cleanup(
		getModules(
			withMemoizedNamedExoticComponent<CharCounterProps>(
				'ChatInputCharCounter',
			),
			ChatInputCharCounter => {
				cleanup(
					instead(ChatInputCharCounter, 'type', function (args, original) {
						const [props] = args
						const { ref } = props

						// Hooks first, always in the same order, then Discord's own render (its hooks follow ours).
						const passRef = useCallback(
							(handle: CharCounterHandle | null) => {
								if (
									handle &&
									!wrapped.has(handle) &&
									typeof handle.onMessageLengthChanged === 'function'
								) {
									const discords = handle.onMessageLengthChanged
									handle.onMessageLengthChanged = value => {
										setLength(value)
										return discords.call(handle, value)
									}
									wrapped.add(handle)
								}
								if (typeof ref === 'function') ref(handle)
								else if (ref) ref.current = handle
							},
							[ref],
						)

						// Discord's hooks must still run (its ref handle is the feed); its drawing is not used.
						Reflect.apply(original, this, [{ ...props, ref: passRef }])
						useEffect(() => () => setLength(0), [])
						return null
					}),
				)
			},
		),
	)
}
