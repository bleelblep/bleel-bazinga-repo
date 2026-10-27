/**
 * A colour, typed as hex or as RGB.
 *
 * Both notations are accepted because people paste whichever they have: `#F0B232`, `f0b232`, or
 * `240, 178, 50`. The swatch shows what is actually stored, and the field only writes when the
 * value parses, so a half-typed colour never reaches the tag.
 *
 * Copied from Staff Tags.
 */

import { FieldRow } from '../../../../shared/ui/fieldGroup'
import { Design } from '@valenced/discord/design'
import * as React from 'react'
import * as ReactNative from 'react-native'

/** `#rrggbb` for anything recognisable, otherwise undefined. */
export function parseColor(input: string): string | undefined {
	const value = input.trim()
	if (!value) return undefined

	const hex = value.replace(/^#/, '')
	if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`
	// Shorthand: #abc means #aabbcc.
	if (/^[0-9a-f]{3}$/i.test(hex))
		return `#${hex
			.split('')
			.map(c => c + c)
			.join('')
			.toUpperCase()}`

	const rgb = value.match(
		/^rgba?\(?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i,
	)
	if (rgb) {
		const parts = [rgb[1], rgb[2], rgb[3]].map(n => Number.parseInt(n, 10))
		if (parts.every(n => n >= 0 && n <= 255))
			return `#${parts
				.map(n => n.toString(16).padStart(2, '0'))
				.join('')
				.toUpperCase()}`
	}

	return undefined
}

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

	// A field row (docs/settings-design-guide.md 3.6): place it inside a TableRowGroup.
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
