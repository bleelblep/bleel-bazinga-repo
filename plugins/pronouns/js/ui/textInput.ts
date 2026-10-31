import { Design } from '@valenced/discord/design'
import type { ComponentProps, ComponentType } from 'react'
import type { TextInputProps as NativeTextInputProps } from 'react-native'

/**
 * `Design.TextInput` forwards the native text input props, but the official type lists only
 * Discord's own. These are the native ones the pages use, plus `isClearable`, which the component
 * reads and the type omits.
 */
type Props = ComponentProps<typeof Design.TextInput> &
	Pick<
		NativeTextInputProps,
		'autoCapitalize' | 'autoCorrect' | 'keyboardType' | 'onSubmitEditing'
	> & {
		isClearable?: boolean
	}

/** Read inside a render, never at module scope (coding rule 1). */
export function textInput(): ComponentType<Props> {
	return Design.TextInput as ComponentType<Props>
}
