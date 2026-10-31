/**
 * The pop-out player (merged in from Pop Out Player): Popout.kt's floating window and Pip.kt's
 * picture-in-picture, registered as `<id>.popout*` by Pocket Browser's native half.
 */

import * as modulesNative from '@valenced/modules/native'

const ID = 'bleelblep.pocket-browser'

function call(name: string, args: unknown[] = []): Promise<any> {
	return (modulesNative as any).callNativeMethod(`${ID}.${name}`, args)
}

/** What the player plays. `url` is always set; YouTube also needs the video id. */
export interface PopoutRequest {
	kind: 'video' | 'youtube'
	/** Set when opening: picture-in-picture or the floating window. */
	mode?: 'pip' | 'overlay'
	url: string
	videoId?: string
	start?: number
	poster?: string
}

export type PopoutStatus = { open: boolean; canOverlay: boolean; pipSupported: boolean; lastError: string | null }

export const native = {
	canOverlay: (): Promise<boolean> => call('popoutCanOverlay'),
	requestOverlay: (): Promise<boolean> => call('popoutRequestOverlay'),
	/** Resolves null when playing, or why not: "overlay permission", "unsupported", "not ready", "pip unsupported". */
	open: (request: PopoutRequest): Promise<string | null> => call('popoutOpen', [JSON.stringify(request)]),
	close: (): Promise<void> => call('popoutClose'),
	status: async (): Promise<PopoutStatus> => {
		const raw = await call('popoutStatus')
		return typeof raw === 'string' ? JSON.parse(raw) : raw
	},
}
