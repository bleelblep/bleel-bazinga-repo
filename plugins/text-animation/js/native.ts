import * as native from '@valenced/modules/native'

export interface TextAnimationStorage {
	typing: boolean
	/** Milliseconds, 120-900. */
	duration: number
	slide: boolean
	/** dp, 2-30. */
	slideDp: number
	blur: boolean
	pop: boolean
	tilt: boolean
	deleteFx: 'off' | 'drop' | 'dust'
	cursor: boolean
	cursorTrail: boolean
	/** 6-40. */
	cursorSpeed: number
	everywhere: boolean
}

export interface NativeState extends TextAnimationStorage {
	/** The custom caret needs Android 10. */
	cursorSupported: boolean
}

export const DEFAULTS: TextAnimationStorage = {
	typing: true,
	duration: 320,
	slide: true,
	slideDp: 10,
	blur: true,
	pop: false,
	tilt: false,
	deleteFx: 'drop',
	cursor: true,
	cursorTrail: true,
	cursorSpeed: 18,
	everywhere: false,
}

const METHOD = 'bleelblep.text-animation'

export function callNative(name: string, args: any[] = []): Promise<any> {
	return (native as any).callNativeMethod(`${METHOD}.${name}`, args)
}
