/**
 * Editing Discord's settings page in place, like the long-press menu's Edit mode and Hide Servers'
 * eye: every item shows, hidden ones darkened; tap one to hide or show it, drag its grip (or hold
 * it) to move it anywhere, into another section too. The page scrolls while dragging near its
 * edges, and Undo puts back the last change of this visit.
 *
 * Discord draws its settings rows itself, from item keys, so while editing patches/settingsPage.tsx
 * shows this list instead: the same sections and items, titled and iconned from Discord's own item
 * config (SETTING_RENDERER_CONFIG's useTitle and IconComponent), with nothing that navigates.
 */

import * as React from 'react'
import * as ReactNative from 'react-native'
import { Design } from '@valenced/discord/design'
import { arrange, moveSettingsItem, PROTECTED_ITEMS, rehome, sectionId, settingsOrder, toggleSettingsItem } from '../lib/layout'
import { useSettings } from '../lib/state'
import { DragSections, useDragScroller } from './DragSections'
import { UndoStack } from '../lib/undo'
import { itemConfig, prettyKey, TitleBoundary } from './SettingsItemsPage'

// ---- Edit state ---------------------------------------------------------------------------------

let editing = false
const listeners = new Set<() => void>()

export function setSettingsEditing(next: boolean) {
	editing = next
	for (const listener of listeners) listener()
}

/** Whether the settings page is being edited, re-rendering on change. Call like a hook. */
export function useSettingsEditing(): boolean {
	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		listeners.add(bump)
		return () => {
			listeners.delete(bump)
		}
	}, [])
	return editing
}

// ---- Rows ---------------------------------------------------------------------------------------

/** One item, titled through its own `useTitle` hook (hence a component). Extra props reach the row. */
function ItemTitleRow({ itemKey, config, ...rest }: any) {
	const { TableRow } = Design as any
	const title = typeof config?.useTitle === 'function' ? config.useTitle() : undefined
	const Icon = TableRow?.Icon
	const IconComponent = config?.IconComponent
	return (
		<TableRow
			{...rest}
			label={typeof title === 'string' && title ? title : prettyKey(itemKey)}
			icon={Icon && IconComponent ? <Icon IconComponent={IconComponent} /> : undefined}
		/>
	)
}

function ItemRow(props: any) {
	const { TableRow } = Design as any
	const { itemKey, config, ...rest } = props
	return (
		<TitleBoundary fallback={<TableRow {...rest} label={prettyKey(itemKey)} />}>
			<ItemTitleRow itemKey={itemKey} config={config} {...rest} />
		</TitleBoundary>
	)
}

// ---- The editor ---------------------------------------------------------------------------------

export function SettingsEditor({ sections }: { sections: any[] }) {
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, Button } = Design as any
	const s = useSettings()
	const order = settingsOrder(s.settingsOrder)
	const config = itemConfig() ?? {}
	// While an item is held, the list must not scroll under the finger.
	const [dragging, setDragging] = React.useState(false)
	const { scroller, scrollProps } = useDragScroller()
	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	const undo = React.useRef<UndoStack | null>(null)
	if (!undo.current) undo.current = new UndoStack(['settingsOrder', 'hiddenSettingsItems', 'hiddenSettingsSections'])
	const record = () => {
		undo.current!.record()
		bump()
	}
	const list = arrange(sections, section => sectionId(section), order.sections)
	const itemsOf = (section: any): string[] =>
		(Array.isArray(section?.settings) ? section.settings : []).filter((key: unknown): key is string => typeof key === 'string')
	// Items dragged into another section go there, then each section in its saved order.
	const groups = rehome(
		list.map(section => ({ id: sectionId(section), items: itemsOf(section) })),
		key => key,
		order.homes,
	).map(group => ({ ...group, items: arrange(group.items, key => key, order.items) }))
	const keysOf = (id: string) => groups.find(group => group.id === id)?.items ?? []
	const labelOf = (id: string) => {
		const label = list.find(section => sectionId(section) === id)?.label
		return typeof label === 'string' ? label : undefined
	}
	const isHidden = (key: string, id: string) =>
		!PROTECTED_ITEMS.has(key) && (s.hiddenSettingsSections?.[id] === true || s.hiddenSettingsItems?.[key] === true)
	// Leaving the page ends editing, so it opens normally next time.
	React.useEffect(
		() => () => {
			editing = false
		},
		[],
	)

	return (
		<View style={{ flex: 1 }}>
			<ScrollView {...scrollProps} scrollEnabled={!dragging} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Tap an item to hide or show it. Drag the dots on the right (or hold the item) to move it, and
						the page scrolls when you reach the edge. Hold and let go to pick a place from a list instead.
						Hidden ones are darkened. Tap Done when you're finished.
					</Text>
					<DragSections
						gap={24}
						Group={TableRowGroup}
						scroller={scroller}
						sections={groups.map(group => ({ id: group.id, keys: group.items, title: labelOf(group.id), groupProps: { title: labelOf(group.id), hasIcons: true } }))}
						dimmed={isHidden}
						renderRow={(key, id) => (
							<ItemRow
								itemKey={key}
								config={config[key]}
								subLabel={
									PROTECTED_ITEMS.has(key)
										? 'Always shown: it leads back to this setting.'
										: isHidden(key, id)
											? 'Hidden. Tap to show.'
											: 'Tap to hide.'
								}
							/>
						)}
						onPressRow={(key, id) => {
							if (PROTECTED_ITEMS.has(key)) return
							record()
							toggleSettingsItem(id, keysOf(id), key)
						}}
						onMove={(key, from, to, index) => {
							record()
							moveSettingsItem(key, from, keysOf(from), to, keysOf(to), index)
						}}
						onDragging={setDragging}
					/>
				</Stack>
			</ScrollView>
			<View style={{ position: 'absolute', right: 16, bottom: 24, flexDirection: 'row', gap: 8 }}>
				{undo.current.size ? (
					<Button
						text="Undo"
						size="md"
						variant="secondary"
						onPress={() => {
							undo.current!.undo()
							bump()
						}}
					/>
				) : null}
				<Button text="Done" size="md" variant="primary" onPress={() => setSettingsEditing(false)} />
			</View>
		</View>
	)
}

/** The floating "Edit" button on Discord's settings page. */
export function EditSettingsButton() {
	const { View } = ReactNative
	const { Button } = Design as any
	return (
		<View style={{ position: 'absolute', right: 16, bottom: 24 }}>
			<Button text="Edit" size="sm" variant="secondary" onPress={() => setSettingsEditing(true)} />
		</View>
	)
}
