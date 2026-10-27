/**
 * Discord's own colour picker: the bottom sheet behind role and profile colours
 * (`modules/color_picker/native/showCustomColorPickerActionSheet.tsx`).
 *
 * Discord only loads that module the first time someone opens a role or profile colour, so a lookup
 * by path or props never sees it (why Theme Studio drew its own picker). Its dependency map can be
 * checked before it loads, though. On 352.2 it is `[ActionSheetActionCreators, <the sheet, its own
 * id + 1>, x, x]` (module 15661 there), and the dependency filter wakes only modules of that shape.
 * The props check then picks the right one.
 *
 * The sheet (CustomColorPickerActionSheet) takes `{ color, onSelect, suggestedColors }`, colours as
 * 0xRRGGBB integers.
 */

import { reportError } from '../../../../shared/report'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'

type ShowPicker = (props: {
	color: number
	onSelect: (color: number) => void
	suggestedColors?: number[]
}) => void

let show: ShowPicker | null | undefined

function find(): ShowPicker | null {
	try {
		const { lookupModule } = finders
		const { withProps, withDependencies } = filters as any
		const [, sheetsId] = lookupModule(withProps('openLazy', 'hideActionSheet')) as any[]
		if (sheetsId == null) return null
		const filter = withDependencies([sheetsId, withDependencies.relative(1), null, null]).and(
			withProps('CUSTOM_COLOR_PICKER_KEY'),
		)
		const [mod] = lookupModule(filter, { returnNamespace: true } as any) as any[]
		return typeof mod?.default === 'function' ? mod.default : null
	} catch (error) {
		reportError('[NewMembers] colour picker lookup failed:', error)
		return null
	}
}

/** Whether Discord's picker can be opened; looked up once. */
export function hasColorPicker(): boolean {
	if (show === undefined) show = find()
	return show !== null
}

// Discord's role colour swatches.
const SUGGESTED = [
	0x1abc9c, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe91e63, 0xf1c40f, 0xe67e22, 0xe74c3c, 0x95a5a6, 0x607d8b,
	0x23a55a,
]

const toInt = (hex: string) => Number.parseInt(hex.replace('#', ''), 16)
const toHex = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`

/** Opens Discord's picker on [hex]; [onPick] gets `#RRGGBB`. False when the picker isn't there. */
export function openColorPicker(hex: string, onPick: (hex: string) => void): boolean {
	if (!hasColorPicker()) return false
	try {
		show!({
			color: toInt(hex),
			onSelect: color => onPick(toHex(color)),
			suggestedColors: SUGGESTED,
		})
		return true
	} catch (error) {
		reportError('[NewMembers] could not open the colour picker:', error)
		return false
	}
}
