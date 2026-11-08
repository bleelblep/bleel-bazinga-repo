/**
 * Discord's text field, keeping a local copy of the value so typing stays smooth while storage
 * catches up. Put it inside a `FieldRow` (settings design guide §3.6); it has no label of its own.
 */
export function TextInputRow({
	value,
	onChangeText,
	placeholder,
	secureTextEntry,
	disabled,
	keyboardType,
}: {
	value: string
	onChangeText: (text: string) => void
	placeholder?: string
	secureTextEntry?: boolean
	disabled?: boolean
	keyboardType?: 'numeric'
}) {
	const React = valenced.react.React
	const { TextField } = valenced.discord.design.Design

	const [localValue, setLocalValue] = React.useState(value)

	React.useEffect(() => {
		setLocalValue(value)
	}, [value])

	const handleChange = (text: string) => {
		const filtered = keyboardType === 'numeric' ? text.replace(/\D/g, '') : text
		setLocalValue(filtered)
		onChangeText(filtered)
	}

	return (
		<TextField
			value={localValue}
			onChange={handleChange}
			placeholder={placeholder}
			secureTextEntry={secureTextEntry}
			isDisabled={disabled}
			isClearable
		/>
	)
}
