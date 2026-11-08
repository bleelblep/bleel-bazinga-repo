import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { arrange, PROTECTED_ITEMS, settingsLayout, settingsOrder } from '../lib/layout'
import { settings, update, useSettings } from '../lib/state'
import { nulls } from './SheetPage'
import * as components from '@valenced/components'
import { Design } from '@valenced/discord/design'
import * as modulesFinders from '@valenced/discord/utils/modules/finders'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'

const CONFIG = 'modules/user_settings/core/native/SettingsRendererConfig.tsx'

/** Discord's settings item config (`SETTING_RENDERER_CONFIG`), for item titles. */
export function itemConfig(): Record<string, any> | undefined {
	try {
		const finders = modulesFinders as any
		return finders.lookupModuleWithImportedPath(CONFIG)?.[0]?.SETTING_RENDERER_CONFIG
	} catch {
		return undefined
	}
}

/** "APP_ICONS" → "App icons", for items whose title can't be read. */
export function prettyKey(key: string): string {
	const words = key.replace(/^bleelblep\./, '').replace(/[._-]+/g, ' ').toLowerCase().trim()
	return words.charAt(0).toUpperCase() + words.slice(1)
}

let Boundary: any
/** Falls back to the key when an item's title hook throws outside Discord's own page. */
export function TitleBoundary(props: { fallback: any; children: any }) {
	if (!Boundary) {
		const { React } = react
		Boundary = class extends React.Component<any, { failed: boolean }> {
			state = { failed: false }
			static getDerivedStateFromError() {
				return { failed: true }
			}
			render() {
				return this.state.failed ? this.props.fallback : this.props.children
			}
		}
	}
	return <Boundary fallback={props.fallback}>{props.children}</Boundary>
}

/** One item's switch, titled through the item's own `useTitle` hook (hence a component each). */
function ItemSwitch(props: { itemKey: string; config: any; shown: boolean; onChange: (shown: boolean) => void }) {
	const { TableSwitchRow } = Design as any
	const title = typeof props.config?.useTitle === 'function' ? props.config.useTitle() : undefined
	const locked = PROTECTED_ITEMS.has(props.itemKey)
	return (
		<TableSwitchRow
			label={typeof title === 'string' && title ? title : prettyKey(props.itemKey)}
			subLabel={locked ? 'Always shown: it leads back to this setting.' : undefined}
			value={locked || props.shown}
			disabled={locked}
			onValueChange={props.onChange}
		/>
	)
}

export default function SettingsItemsPage() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const s = useSettings()
	const order = settingsOrder(s.settingsOrder)
	const layout = arrange(settingsLayout(s.settingsLayout), section => section.id, order.sections)
	const config = itemConfig() ?? {}

	const setItem = (key: string, shown: boolean) =>
		update({ hiddenSettingsItems: { ...settings().hiddenSettingsItems, [key]: shown ? null : true } })
	const setSection = (id: string, shown: boolean) =>
		update({ hiddenSettingsSections: { ...settings().hiddenSettingsSections, [id]: shown ? null : true } })

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="On the settings page" hasIcons>
						<TableSwitchRow
							label="Edit button"
							subLabel="An Edit button at the bottom of Discord's settings: tap items to hide or show them, hold and drag to move them."
							icon={rowIcon('PencilIcon', 'CompassIcon')}
							value={s.settingsEditButton}
							onValueChange={(settingsEditButton: boolean) => update({ settingsEditButton })}
						/>
					</TableRowGroup>

					{layout.length === 0 ? (
						<TableRowGroup title="Sections">
							<TableRow label="Nothing seen yet" subLabel="Open Discord's settings once (You, then the gear) and its sections show up here." />
						</TableRowGroup>
					) : (
						layout.map(section => {
							const sectionShown = s.hiddenSettingsSections?.[section.id] !== true
							return (
								<TableRowGroup
									key={section.id}
									title={section.label ?? 'Unnamed section'}
									description={section === layout[0] ? 'Turn something off to hide it. Changes show the next time you open settings.' : undefined}
								>
									<TableSwitchRow
										label="Show this section"
										value={sectionShown}
										onValueChange={(shown: boolean) => setSection(section.id, shown)}
									/>
									{sectionShown &&
										arrange(section.settings, key => key, order.items).map(key => {
											const fallback = (
												<TableSwitchRow
													label={prettyKey(key)}
													value={s.hiddenSettingsItems?.[key] !== true}
													onValueChange={(shown: boolean) => setItem(key, shown)}
												/>
											)
											return (
												<TitleBoundary key={key} fallback={fallback}>
													<ItemSwitch
														itemKey={key}
														config={config[key]}
														shown={s.hiddenSettingsItems?.[key] !== true}
														onChange={(shown: boolean) => setItem(key, shown)}
													/>
												</TitleBoundary>
											)
										})}
								</TableRowGroup>
							)
						})
					)}

					<TableRowGroup>
						<TableRow
							label="Back to Discord's order"
							subLabel="Undo moving items on the settings page."
							icon={rowIcon('RetryIcon', 'RefreshIcon')}
							disabled={!s.settingsOrder}
							onPress={() => update({ settingsOrder: '' })}
						/>
						<TableRow
							label="Show everything again"
							icon={rowIcon('RetryIcon', 'RefreshIcon')}
							onPress={() =>
								update({
									hiddenSettingsItems: nulls(settings().hiddenSettingsItems),
									hiddenSettingsSections: nulls(settings().hiddenSettingsSections),
								})
							}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
