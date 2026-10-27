import { Clipboard } from '@valenced/externals/react-native-clipboard'
import * as ReactNative from 'react-native'

/** The two clipboard calls this plugin makes, in the shape both modules share. */
interface ClipboardLike {
	getString?(): Promise<unknown>
	setString?(text: string): void
}

/** Valenced's bundled clipboard module, falling back to React Native's own, which its types no longer list. */
function clipboard(): ClipboardLike | undefined {
	return (
		(Clipboard as ClipboardLike | undefined) ??
		(ReactNative as unknown as { Clipboard?: ClipboardLike }).Clipboard
	)
}

/** Read explicitly requested clipboard text without depending on a multiline field's paste handling. */
export async function readClipboardText(): Promise<string> {
	const module = clipboard()
	if (typeof module?.getString !== 'function')
		throw new Error('Clipboard is unavailable')
	const text = await module.getString()
	if (typeof text !== 'string') throw new Error('Clipboard did not return text')
	return text
}

/** Copies [text]. False if neither clipboard module is there. */
export function copyText(text: string): boolean {
	try {
		const module = clipboard()
		if (typeof module?.setString !== 'function') return false
		module.setString(text)
		return true
	} catch {
		return false
	}
}
