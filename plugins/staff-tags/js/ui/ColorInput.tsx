/**
 * A colour, typed as hex or as RGB.
 *
 * Both notations are accepted because people paste whichever they have: `#F0B232`, `f0b232`, or
 * `240, 178, 50`. The swatch shows what is actually stored, and the field only writes when the
 * value parses, so a half-typed colour never reaches the tag.
 */

import { Design } from '@valenced/discord/design'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { parseColor } from '../lib/color'
import { FieldRow } from './fieldGroup'

export interface ColorInputProps {
	label: string
	description?: string
	/** The stored colour, or '' when unset. */
	value: string
	/** The colour shown in the swatch when nothing is stored. */
	placeholder: string
	onChange: (color: string) => void
}

export default function ColorInput({
	label,
	description,
	value,
	placeholder,
	onChange,
}: ColorInputProps) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { View } = ReactNative
	const { TextInput } = Design

	const [draft, setDraft] = React.useState(value)
	const parsed = parseColor(draft)
	const swatch = parsed ?? (value || placeholder)

	// A field row (docs/plugin-design-language.md 3.6): place it inside a TableRowGroup.
	return (
		<FieldRow
			label={label}
			description={description ?? 'Hex like #F0B232, or RGB like 240, 178, 50'}
		>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
				<View
					style={{
						width: 36,
						height: 36,
						borderRadius: 8,
						backgroundColor: swatch,
					}}
				/>
				<View style={{ flex: 1 }}>
					<TextInput
						placeholder={placeholder}
						value={draft}
						returnKeyType="done"
						isClearable
						status={draft && !parsed ? 'error' : 'default'}
						errorMessage={
							draft && !parsed ? "That isn't a colour I can read" : undefined
						}
						onChange={next => {
							setDraft(next)
							const colour = parseColor(next)
							// Empty means "back to the default", which is a valid thing to want.
							if (colour) onChange(colour)
							else if (!next.trim()) onChange('')
						}}
					/>
				</View>
			</View>
		</FieldRow>
	)
}
