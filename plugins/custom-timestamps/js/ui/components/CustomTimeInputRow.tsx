// getModules, not lookupModule: confirmed on-device (staff-tags plugin) that a lazily-loaded
// UI component can still be unregistered even from inside start() -- it only initializes
// once its screen actually renders. lookupModule gives up immediately and permanently caches
// that as "not found"; getModules subscribes and calls back whenever the module loads.
// The input component is a named `InputView` export on classic Revenge builds, not the
// module's default -- never destructure a finder result, keep both fallbacks.
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

let inputModule: any
getModules(withProps("ClearButtonVisibility"), (mod: any) => {
	inputModule = mod
})

export function CustomTimeInputRow({
	value,
	onChangeText,
	placeholder,
	disabled,
}: {
	value: string
	onChangeText: (text: string) => void
	placeholder: string
	disabled?: boolean
}) {
	const InputView = inputModule?.InputView ?? inputModule?.default
	if (!InputView) return null

	return (
		<InputView
			value={value}
			onChangeText={onChangeText}
			placeholder={placeholder}
			clearButtonVisibility={inputModule?.ClearButtonVisibility?.WITH_CONTENT}
			showBorder={false}
			showTopContainer={false}
			disabled={disabled}
			style={{ paddingHorizontal: 15, paddingVertical: 13 }}
		/>
	)
}
