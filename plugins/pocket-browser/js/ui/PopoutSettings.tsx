/** The pop-out player's settings (merged in from Pop Out Player): style, permission, close. */

import { rowIcon } from '../../../../shared/ui/icon'
import { native, type PopoutStatus } from '../popout/player'
import { type PocketBrowserStorage, update, useSettings } from '../lib/store'
import { Design } from '@valenced/discord/design'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'

export default function PopoutSettings() {
	const { React } = react
	const { AppState } = ReactNative
	const { TableRowGroup, TableRow, TableRadioGroup, TableRadioRow } = Design as any
	const s = useSettings()
	const [status, setStatus] = React.useState<PopoutStatus | undefined>()

	const refresh = React.useCallback(() => {
		native.status().then(setStatus, () => setStatus(undefined))
	}, [])
	React.useEffect(() => {
		refresh()
		// Coming back from Android's settings page: show the new permission state.
		const subscription = AppState.addEventListener('change', (state: string) => state === 'active' && refresh())
		return () => subscription.remove()
	}, [refresh])

	return (
		<>
			<TableRadioGroup
				key={`popoutMode-${s.popoutMode}`}
				title="Pop-out player"
				description="Pop videos out of Discord's media viewer (the button at the top) or out of a page (⋮ → Pop out video)."
				defaultValue={s.popoutMode}
				onChange={(popoutMode: PocketBrowserStorage['popoutMode']) => update({ popoutMode })}
			>
				<TableRadioRow
					label="Picture-in-picture"
					subLabel="Android's own small window, like YouTube. Discord is the window while it plays."
					value="pip"
				/>
				<TableRadioRow
					label="Floating window"
					subLabel="A window you can drag and pinch, over every app, while you keep using Discord. Needs Display over other apps."
					value="overlay"
				/>
			</TableRadioGroup>

			<TableRowGroup hasIcons>
				{s.popoutMode === 'pip' && status && !status.pipSupported ? (
					<TableRow
						label="Picture-in-picture not available"
						subLabel="This phone has it turned off for apps. Use Floating window instead."
						icon={rowIcon('WarningIcon')}
					/>
				) : null}
				{s.popoutMode === 'overlay' ? (
					<TableRow
						label="Display over other apps"
						subLabel={
							status === undefined
								? 'Checking…'
								: status.canOverlay
									? 'Allowed. The player can float.'
									: 'Not allowed yet. Tap to open the Android setting for Discord.'
						}
						icon={rowIcon(status?.canOverlay ? 'CircleCheckIcon' : 'WarningIcon', 'WindowLaunchIcon')}
						arrow={!status?.canOverlay}
						onPress={status?.canOverlay ? undefined : () => void native.requestOverlay()}
					/>
				) : null}
				<TableRow
					label="Close the player"
					subLabel={status?.open ? 'A video is popped out.' : 'Nothing is playing.'}
					icon={rowIcon('XSmallIcon', 'CloseSmallIcon')}
					disabled={!status?.open}
					onPress={() => native.close().then(refresh, refresh)}
				/>
			</TableRowGroup>
		</>
	)
}
