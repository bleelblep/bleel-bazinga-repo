/**
 * A text field or slider (or a few related ones) in a row, so it sits on the same background as the row
 * groups around it instead of floating on the page. Shared by every plugin; see
 * docs/settings-design-guide.md 3.6.
 *
 * `label` names the field (the row's label), `title` is an optional group heading, and the
 * explanation goes inside the row as muted text, so don't also pass `label` / `description` to the
 * TextInput. Error text stays on the TextInput (`status` + `errorMessage`).
 *
 * Not for search boxes above a list or fields inside an alert dialog: those stay bare.
 *
 * Call from inside a component's render: `valenced.*` is read here, so module scope is out
 * (docs/coding-rules.md rule 1).
 */
import * as discordDesign from '@valenced/discord/design'
import * as ReactNative from 'react-native'

interface FieldRowProps {
	/** The row's label: names the field. */
	label: string
	/** Muted text under the field, inside the row. */
	description?: any
	children: any
}

/**
 * Discord's design components, or undefined when Revenge can't find them. A failed lookup is cached
 * for every plugin, and reading the lazy proxy then throws "target is not an object" -- which took
 * Discord down from a settings page (Send Tweaks 0.7.4, 2026-10-06). The fields still work without
 * them, just drawn plainer.
 */
function design(): any {
	try {
		const Design = discordDesign.Design as any
		return Design?.TableRow ? Design : undefined
	} catch {
		return undefined
	}
}

/**
 * The field without Discord's row: React Native's own parts, which are always there. Grey text
 * reads on light and dark themes alike; the theme's colours come from the same lookup that failed.
 */
function PlainFieldRow({ label, description, children }: FieldRowProps) {
	const { View, Text } = ReactNative
	return (
		<View style={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
			<Text style={{ fontSize: 16, fontWeight: '600', color: '#9a9aa2' }}>{label}</Text>
			{children}
			{description ? <Text style={{ fontSize: 12, color: '#9a9aa2', opacity: 0.8 }}>{description}</Text> : null}
		</View>
	)
}

/**
 * One field as a real TableRow: the field (and its explanation) is the row's `subLabel`, typed
 * ReactNode, so the row paints its background. Put several in one TableRowGroup for related fields.
 */
export function FieldRow({ label, description, children }: FieldRowProps) {
	const { View } = ReactNative
	const Design = design()
	if (!Design) return <PlainFieldRow label={label} description={description}>{children}</PlainFieldRow>
	const { TableRow, Text } = Design
	// A row group paints nothing itself: each TableRow draws its own background, and themes recolour
	// rows through their own tokens (a Card drifted to a different shade under custom themes). So the
	// field goes inside a real row and gets the row's surface.
	return (
		<TableRow
			label={label}
			subLabel={
				<View style={{ gap: 8, marginTop: 8 }}>
					{children}
					{description ? (
						<Text variant="text-sm/normal" color="text-muted">
							{description}
						</Text>
					) : null}
				</View>
			}
		/>
	)
}

/** A group holding one field row, with an optional heading. */
export function FieldGroup({ title, ...row }: FieldRowProps & { title?: string }) {
	const TableRowGroup = design()?.TableRowGroup
	if (!TableRowGroup) {
		const { View } = ReactNative
		return (
			<View>
				<FieldRow {...row} />
			</View>
		)
	}
	return (
		<TableRowGroup title={title}>
			<FieldRow {...row} />
		</TableRowGroup>
	)
}
