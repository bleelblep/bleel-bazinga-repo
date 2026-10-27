import * as assets from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'

/**
 * A leading icon for a settings row, by icon name. Shared by every plugin's `js/ui/icon.tsx`.
 *
 * Icon naming splits in two: older icons are *registry assets* resolved by `getAssetIdByName`,
 * while Discord's newer set (the `redesign/generated/*.tsx` modules) are generated React
 * *components* that only `lookupGeneratedIconComponent` can see. Each name is tried as an asset and
 * then as a component before moving on to the next name. First hit wins; if every name misses, the
 * row gets no icon rather than a broken image.
 *
 * The per-name order is the fix this file exists for. Fourteen plugins used to try *every* name as
 * an asset first and only then as components, which let a generic asset fallback at the end of the
 * list (`PuzzlePieceIcon`, `ic_settings`) beat a real component icon listed ahead of it.
 *
 * Call from inside a component's render: `valenced.*` is read here, so module scope is out
 * (docs/coding-rules.md rule 1).
 */

/**
 * Other names to try for an icon Discord has removed. There is no standalone sparkle in 348:
 * `SparklesIcon` is gone and `SparkleIcon` only survives inside `PencilSparkleIcon` /
 * `ImageSparkleIcon`. Installed manifests may still carry either, so both fall back to the wand.
 */
const ALIASES: Record<string, string[]> = {
	SparklesIcon: ['MagicWandIcon'],
	SparkleIcon: ['MagicWandIcon'],
}

export function rowIcon(...requested: string[]) {
	return findIcon(requested, false)
}

/**
 * The same, for a row with `variant="danger"`. The variant only colours the row's text; Discord
 * tells the icon separately, so stock danger rows are
 * `<TableRow variant="danger" icon={<TableRow.Icon IconComponent={X} variant="danger" />} />`
 * (348.5 bundle, e.g. ModeratorActionRow). `TableRow.Icon`'s danger style is the
 * `TEXT_FEEDBACK_CRITICAL` colour, so the red comes from there. See docs/settings-design-guide.md §3.8.
 */
export function dangerIcon(...requested: string[]) {
	return findIcon(requested, true)
}

/** `valenced.*` can be mid-load or missing a key; a miss costs the icon, not the row. */
function safe<T>(read: () => T): T | undefined {
	try {
		return read()
	} catch {
		return undefined
	}
}

function findIcon(requested: string[], danger: boolean) {
	const names = [
		...new Set(requested.flatMap(name => [name, ...(ALIASES[name] ?? [])])),
	]
	const { getAssetIdByName } = assets
	const { TableRow, TableRowIcon } = Design as any
	const Icon = TableRow?.Icon ?? TableRowIcon
	const lookupComponent = safe(
		() => lookupGeneratedIconComponent,
	)

	for (const name of names) {
		const source = safe(() => getAssetIdByName(name) || undefined)
		const Component = safe(() => lookupComponent?.(name))
		if (danger) {
			if (Icon && (Component || source))
				return (
					<Icon source={source} IconComponent={Component} variant="danger" />
				)
			continue
		}
		if (source && Icon) return <Icon source={source} />
		if (Component) return <Component />
	}

	return undefined
}
