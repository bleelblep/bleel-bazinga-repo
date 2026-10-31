/**
 * The quick reactions above the message long-press menu. Each is a PressableOpacity whose style
 * (`emojiContainer`) takes its corner from the `button.BORDER_RADIUS` token inside a createStyles
 * sheet, with a background and `overflow: hidden` (351.3 hasm, EmojiReactionRowButton.tsx).
 * Discord's PressableBase also copies that borderRadius into the Android ripple's corner, which
 * Corners.kt squares through RoundRectShape. Here the button's own style gets a radius of 0 last,
 * so it's square whichever way the token resolved.
 */

import { getModuleByPath } from '../../../../shared/modules'
import { reportError } from '../../../../shared/report'
import { after } from '@valenced/patcher'
import * as react from '@valenced/react'

const TAG = '[Sharp Corners]'
const PATH = 'modules/reactions/native/EmojiReactionRowButton.tsx'
const BUTTONS = ['EmojiReactionRowButton', 'EmojiPickerRowButton']
const SQUARE = { borderRadius: 0 }

function squareRoot(tree: any): any {
	const { React } = react
	if (!React.isValidElement(tree)) return tree
	const style = (tree as any).props?.style
	return React.cloneElement(tree as any, { style: style ? [style, SQUARE] : SQUARE } as any)
}

/** Hooks both row buttons while `active()` says so. Returns a cleanup. */
export function squareEmojiRow(active: () => boolean): () => void {
	const cleanups: Array<() => void> = []
	cleanups.push(
		getModuleByPath(
			PATH,
			null,
			(ns: any) => {
				for (const name of BUTTONS) {
					const exported = ns?.[name]
					const target: [any, string] | undefined =
						typeof exported === 'function'
							? [ns, name]
							: typeof exported?.type === 'function'
								? [exported, 'type']
								: typeof exported?.render === 'function'
									? [exported, 'render']
									: undefined
					if (!target) {
						reportError(`${TAG} ${PATH}: ${name} is not a component`)
						continue
					}
					cleanups.push(
						after(target[0], target[1], (tree: any) => {
							if (!active()) return tree
							try {
								return squareRoot(tree)
							} catch (error) {
								reportError(`${TAG} emoji row failed:`, error)
								return tree
							}
						}),
					)
				}
			},
			TAG,
		),
	)
	return () => {
		for (const cleanup of cleanups.splice(0).reverse()) {
			try {
				cleanup()
			} catch {
				/* already gone */
			}
		}
	}
}
