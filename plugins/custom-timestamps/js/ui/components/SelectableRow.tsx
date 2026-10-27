import { getModuleByPath } from "../../../../../shared/modules"
import { Design } from "@valenced/discord/design"
import { withName } from "@valenced/modules/finders/filters"

// A subscription, not a one-off lookup: confirmed on-device (staff-tags plugin) that a
// lazily-loaded UI component can still be unregistered even from inside start() -- it only
// initializes once its screen actually renders. Read lazily as a plain variable rather than
// React state -- there's nothing to re-render for here, `trailing` just omits the checkmark
// until it resolves.
//
// By path, because Discord 349.5 minifies function names and `withName("RowCheckmark")` finds
// nothing there; the name stays as the fallback. Subscribed on first render rather than at
// module scope, where touching `valenced.discord.*` poisons Discord's lazy lookups.
let rowCheckmark: any
let subscribed = false
function subscribeRowCheckmark() {
	if (subscribed) return
	subscribed = true
	getModuleByPath(
		"design/void/Form/native/FormCheckmark.tsx",
		withName("RowCheckmark"),
		(mod: any) => {
			if (typeof mod?.default === "function") rowCheckmark = mod.default
		},
		"[CustomTimestamps]",
	)
}

export function SelectableRow({
	label,
	subLabel,
	selected,
	onPress,
}: {
	label: string
	subLabel?: string
	selected: boolean
	onPress: () => void
}) {
	// Read per-render, never at module scope -- see the "Never touch valenced.* at module scope"
	// section in the README. Design is a lazy proxy over lookupModule, and resolving it during
	// preInit poisons the shared filter key for the whole app, Valenced's own settings UI included.
	const { TableRow } = Design

	subscribeRowCheckmark()
	const RowCheckmark = rowCheckmark
	return (
		<TableRow
			label={label}
			subLabel={subLabel}
			trailing={RowCheckmark ? <RowCheckmark selected={selected} /> : undefined}
			onPress={onPress}
		/>
	)
}
