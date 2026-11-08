/**
 * Edit mode for the message long-press sheet: hide, show and move rows from the sheet itself.
 *
 * patches/sheetRows.tsx hands every message sheet's ActionSheet render to [MessageSheet] below.
 * It builds the sheet's children afresh on each render, never mutating Discord's elements, because
 * edit mode re-renders the same props:
 *
 * - Normally: hidden rows and sections are left out (as before) and an "Edit menu" row is added
 *   at the end (if that setting is on).
 * - Editing: every row is shown, including hidden ones. Each row's icon becomes an eye (shown) or
 *   darkened (hidden) or not, and tapping it flips that row instead of running its action.
 *   An "Emoji row" switch sits on top, and "Done" at the end leaves edit mode.
 *
 * Editing works like Hide Servers' eye button: every row shows, hidden ones darkened. Tap a row to
 * hide or show it; hold it and drag to move it, into another section too (ui/DragSections.tsx, saved
 * by lib/layout.ts moveSheetRow). Both modes draw rows in their saved section and order.
 *
 * Edit mode ends when the sheet closes. Nothing here runs a row's own action while editing, so no
 * message action can fire by accident.
 */

import * as React from 'react'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { Design } from '@valenced/discord/design'
import {
	arrange,
	moveSheetRow,
	pluginSectionKey,
	recordSheet,
	rehome,
	rowKey,
	sectionIndexFor,
	sheetGroupHidden,
	sheetLayout,
	sheetOrder,
	sheetRowHidden,
} from '../lib/layout'
import { onUpdate, settings, update } from '../lib/state'
import { DragSections } from '../ui/DragSections'
import { reportError } from '../../../../shared/report'

const TAG = '[UITweaks]'

// ---- Edit state ---------------------------------------------------------------------------------

let editing = false
const editListeners = new Set<() => void>()

function setEditing(next: boolean) {
	editing = next
	for (const listener of editListeners) listener()
}

// ---- Discord pieces, looked up on first use (coding rule 1) ---------------------------------------

let actionSheetRow: any
function Row(): any {
	if (!actionSheetRow) {
		try {
			actionSheetRow = finders.lookupModule<any>((filters.withProps as any)('ActionSheetRow'))?.[0]?.ActionSheetRow
		} catch {
			actionSheetRow = undefined
		}
	}
	return actionSheetRow
}

const icons = new Map<string, unknown>()
function icon(name: string): unknown {
	if (!icons.has(name)) {
		let found: unknown
		try {
			found = (lookupGeneratedIconComponent as any)(name)
		} catch {
			found = undefined
		}
		if (found) icons.set(name, found)
		return found
	}
	return icons.get(name)
}

// ---- Tree helpers -------------------------------------------------------------------------------

function flat(children: any): any[] {
	if (children == null || children === false) return []
	if (Array.isArray(children)) return children.flatMap(flat)
	return [children]
}

export function isRow(node: any): boolean {
	return !!node?.props && typeof node.props.label === 'string' && typeof node.props.onPress === 'function'
}

/** Discord's rows pass an `IconComponent`, plugins an asset `source`. */
function isPluginRow(row: any): boolean {
	return !row.props.icon?.props?.IconComponent
}

/** A copy of [element] with [props] merged in; Discord's element is left as it was. */
function withProps(element: any, props: Record<string, unknown>): any {
	return { ...element, props: { ...element.props, ...props } }
}

/** A row's icon swapped for [IconComponent], keeping the row's own icon element type when it has one. */
function iconWith(row: any, IconComponent: unknown): any {
	const R = Row()
	const Icon = row?.props?.icon?.type ?? R?.Icon
	if (!Icon || !IconComponent) return row?.props?.icon
	return <Icon IconComponent={IconComponent} />
}

interface Section {
	element: any
	rows: any[]
	/** Position + 1 for Discord's sections, a `plugin:` key for plugin ones, 0 when unknown. */
	id: number | string
}

/** Reads the sheet's sections and records them for the settings page (lib/layout.ts). */
function readSections(children: any[]): Section[] {
	const groups = children.filter(child => flat(child?.props?.children).some(isRow))
	const rowsOf = (group: any) => flat(group.props.children).filter(isRow)
	const pluginOnly = (group: any) => rowsOf(group).every(isPluginRow)
	const saved = sheetLayout()

	const sections: string[][] = []
	const plugins: Record<string, string[]> = {}
	const keys = new Map<any, string>()
	for (const group of groups) {
		const labels = rowsOf(group).map((row: any) => rowKey(row.props.label))
		if (pluginOnly(group)) {
			const key = pluginSectionKey(labels, saved)
			keys.set(group, key)
			plugins[key] = [...(plugins[key] ?? []), ...labels.filter(label => !plugins[key]?.includes(label))]
		} else sections.push(labels)
	}
	const layout = recordSheet(sections, plugins)

	return groups.map(group => ({
		element: group,
		rows: rowsOf(group),
		id: pluginOnly(group)
			? (keys.get(group) ?? 0)
			: sectionIndexFor(layout, rowsOf(group).map((row: any) => rowKey(row.props.label))) + 1,
	}))
}

function groupHidden(id: number | string): boolean {
	return id !== 0 && sheetGroupHidden(id)
}

// ---- Order --------------------------------------------------------------------------------------

/** The sheet's children with its sections in the saved order. Other children keep their place. */
function arrangedSections(children: any[], sections: Section[]): any[] {
	const idOf = (child: any) => {
		const id = sections.find(s => s.element === child)?.id
		return id === undefined || id === 0 ? undefined : String(id)
	}
	return arrange(children, idOf, sheetOrder().sections)
}

/** A section's id as saved in the order (sections with no known id keep their place). */
const idText = (section: Section) => String(section.id)

/**
 * The sheet's sections in the saved order, each with its rows: rows dragged into another section
 * moved there (a section that isn't on this sheet keeps its rows), then in the saved order. Other
 * children (not sections) come back as they were, with no rows.
 */
function homedSections(children: any[], sections: Section[]): Array<{ child: any; section?: Section; rows: any[] }> {
	const order = sheetOrder()
	const arranged = arrangedSections(children, sections).map(child => ({ child, section: sections.find(s => s.element === child) }))
	const rowKeyOf = (row: any) => (isRow(row) ? rowKey(row.props.label) : undefined)
	const sectioned = arranged.filter(entry => entry.section)
	const homed = rehome(
		sectioned.map(entry => ({ id: idText(entry.section!), items: flat(entry.child.props.children) })),
		rowKeyOf,
		order.homes,
	)
	return arranged.map(entry => {
		if (!entry.section) return { ...entry, rows: [] }
		// By position, not id: two of Discord's sections can match the same saved one (a sheet that
		// splits rows another sheet kept together), and looking up by id gave both the first's rows (0.9.5).
		const items = homed[sectioned.indexOf(entry)]?.items ?? []
		return { ...entry, rows: arrange(items, rowKeyOf, order.rows) }
	})
}


/** One of our own groups, holding [rows]. */
function ourGroup(key: string, rows: any[]): any {
	const R = Row()
	const Group = R?.Group
	if (!Group) return null
	return <Group key={key}>{rows}</Group>
}

// ---- Normal mode --------------------------------------------------------------------------------

function normalChildren(children: any[], sections: Section[]): any[] {
	const out: any[] = []
	for (const { child, section, rows: homed } of homedSections(children, sections)) {
		if (!section) {
			out.push(child)
			continue
		}
		if (groupHidden(section.id)) continue
		const rows = flat(child.props.children)
		const kept = homed.filter(row => !isRow(row) || !sheetRowHidden(rowKey(row.props.label)))
		// A section left with no rows goes too, rather than an empty gap.
		if (!kept.some(isRow)) continue
		const same = kept.length === rows.length && kept.every((row, index) => row === rows[index])
		out.push(same ? child : withProps(child, { children: kept }))
	}

	const R = Row()
	if (R && settings().sheetEditRow) {
		const group = ourGroup('ui-tweaks-edit', [
			<R
				key="ui-tweaks-edit-row"
				label="Edit menu"
				subLabel="Hide, show or move rows in this menu"
				icon={iconWith(undefined, icon('PencilIcon'))}
				onPress={() => setEditing(true)}
			/>,
		])
		if (group) out.push(group)
	}
	return out
}

// ---- Edit mode ----------------------------------------------------------------------------------

/** Flips one row. A row hidden by its whole section brings the section back with only that row. */
function toggleRow(sectionId: number | string, keys: string[], label: string) {
	const s = settings()
	const rows = { ...s.hiddenSheetRows }
	const groups = { ...s.hiddenSheetGroups }
	if (groupHidden(sectionId)) {
		groups[String(sectionId)] = null
		for (const key of keys) rows[key] = key === label ? null : true
	} else {
		rows[label] = rows[label] === true ? null : true
	}
	update({ hiddenSheetRows: rows, hiddenSheetGroups: groups })
}

function editChildren(children: any[], sections: Section[], hasHeader: boolean): any[] {
	const R = Row()
	if (!R) return children
	const Eye = icon('EyeIcon')
	const EyeSlash = icon('EyeSlashIcon') ?? Eye
	const out: any[] = []

	if (hasHeader) {
		const hidden = settings().hideSheetEmojiRow
		const group = ourGroup('ui-tweaks-edit-top', [
			<R
				key="ui-tweaks-emoji-row"
				label="Emoji row"
				subLabel={hidden ? 'Hidden. Tap to show.' : 'Shown. Tap to hide.'}
				icon={iconWith(undefined, hidden ? EyeSlash : Eye)}
				onPress={() => update({ hideSheetEmojiRow: !settings().hideSheetEmojiRow })}
			/>,
		])
		if (group) out.push(group)
	}

	const entries = homedSections(children, sections)
	for (const entry of entries) if (!entry.section) out.push(entry.child)
	const specs = entries
		.filter(entry => entry.section)
		.map(entry => {
			const rows = entry.rows.filter(isRow)
			const { children: _children, ...groupProps } = entry.child.props
			return { entry, rows, keys: rows.map(row => rowKey(row.props.label)), groupProps }
		})
	const specOf = (id: string) => specs.find(spec => idText(spec.entry.section!) === id)
	const isHidden = (key: string, id: string) => {
		const section = specOf(id)?.entry.section
		return (section ? groupHidden(section.id) : false) || sheetRowHidden(key)
	}
	out.push(
		<DragSections
			key="ui-tweaks-edit-sections"
			gap={12}
			Group={Row()?.Group}
			sections={specs.map(spec => ({
				id: idText(spec.entry.section!),
				keys: spec.keys,
				groupProps: spec.groupProps,
				Group: spec.entry.child.type,
			}))}
			dimmed={isHidden}
			// Our own row element: no onPress of its own, so the tap reaches DragSections (toggle) and
			// a hold starts the drag. variant and disabled are cleared so nothing looks off-limits.
			renderRow={(key, id) => {
				const spec = specOf(id)
				const row = spec?.rows[spec.keys.indexOf(key)]
				return withProps(row ?? <R label={key} />, {
					subLabel: isHidden(key, id) ? 'Hidden. Tap to show, hold to move.' : 'Tap to hide, hold to move.',
					variant: undefined,
					disabled: false,
					onPress: undefined,
				})
			}}
			onPressRow={(key, id) => {
				const spec = specOf(id)
				if (spec) toggleRow(spec.entry.section!.id, spec.keys, key)
			}}
			onMove={(key, from, to, index) => moveSheetRow(key, from, specOf(from)?.keys ?? [], to, specOf(to)?.keys ?? [], index)}
		/>,
	)

	const done = ourGroup('ui-tweaks-edit-done', [
		<R
			key="ui-tweaks-done-row"
			label="Done"
			icon={iconWith(undefined, icon('CheckmarkLargeIcon'))}
			onPress={() => setEditing(false)}
		/>,
	])
	if (done) out.push(done)
	return out
}

// ---- The component ------------------------------------------------------------------------------

/** The ActionSheet element: the first one that is Design.ActionSheet or carries a `header` prop. */
export function findActionSheet(node: any, depth = 0): any {
	if (!node || typeof node !== 'object' || depth > 6) return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = findActionSheet(child, depth + 1)
			if (found) return found
		}
		return undefined
	}
	const ActionSheet = (Design as any)?.ActionSheet
	if (node.props && (node.type === ActionSheet || 'header' in node.props)) return node
	return findActionSheet(node.props?.children, depth + 1)
}

/** [node] with [target] swapped for [replacement]; only the elements on the way are copied. */
function replaceIn(node: any, target: any, replacement: any, depth = 0): any {
	if (node === target) return replacement
	if (!node || typeof node !== 'object' || depth > 8) return node
	if (Array.isArray(node)) {
		let changed = false
		const out = node.map(child => {
			const next = replaceIn(child, target, replacement, depth + 1)
			if (next !== child) changed = true
			return next
		})
		return changed ? out : node
	}
	const children = node.props?.children
	if (children == null) return node
	const next = replaceIn(children, target, replacement, depth + 1)
	return next === children ? node : withProps(node, { children: next })
}

/**
 * Wraps what the sheet module rendered. Discord's ActionSheet element stays exactly where it was,
 * so other plugins (Ghost Log NG's Local edit) still find it by its type and add their rows to it.
 * When this renders, after every plugin's hook, it draws a copy of that tree with our sheet.
 */
export function SheetStandIn({ children }: { children?: any }) {
	const [, force] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		editListeners.add(force)
		const offUpdate = onUpdate(force)
		return () => {
			editListeners.delete(force)
			offUpdate()
			// Closing the sheet ends edit mode.
			editing = false
		}
	}, [])

	try {
		const sheet = findActionSheet(children)
		if (!sheet) return children ?? null
		const sheetProps = sheet.props
		const rows = flat(sheetProps.children)
		const sections = readSections(rows)
		const next = editing
			? { ...sheetProps, children: editChildren(rows, sections, sheetProps.header != null) }
			: {
					...sheetProps,
					header: settings().hideSheetEmojiRow ? null : sheetProps.header,
					children: normalChildren(rows, sections),
				}
		return replaceIn(children, sheet, withProps(sheet, next))
	} catch (error) {
		reportError(`${TAG} long-press sheet failed:`, error)
		return children ?? null
	}
}
