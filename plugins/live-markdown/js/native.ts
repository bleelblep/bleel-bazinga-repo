import { callNativeMethod } from '@valenced/modules/native'

export interface LiveMarkdownStorage {
	headings: boolean
	dimMarkers: boolean
	monoCode: boolean
	/** Formats shown in the message box's text-selection menu (Format ids in Format.kt). */
	menu: string[]
}

export const DEFAULTS: LiveMarkdownStorage = {
	headings: true,
	dimMarkers: true,
	monoCode: true,
	menu: [
		'bold',
		'italic',
		'underline',
		'strike',
		'spoiler',
		'code',
		'codeBlock',
		'link',
		'h1',
		'h2',
		'h3',
		'subtext',
		'quote',
		'ansi',
	],
}

/** The selection-menu options, in menu order. Ids match Format.kt. */
export const FORMATS: Array<{ id: string; label: string; example: string }> = [
	{ id: 'bold', label: 'Bold', example: '**text**' },
	{ id: 'italic', label: 'Italic', example: '*text*' },
	{ id: 'underline', label: 'Underline', example: '__text__' },
	{ id: 'strike', label: 'Strikethrough', example: '~~text~~' },
	{ id: 'spoiler', label: 'Spoiler', example: '||text||' },
	{ id: 'code', label: 'Code', example: '`text`' },
	{ id: 'codeBlock', label: 'Code block', example: '```text```' },
	{ id: 'link', label: 'Link', example: '[text](address)' },
	{ id: 'h1', label: 'Big heading', example: '# text' },
	{ id: 'h2', label: 'Medium heading', example: '## text' },
	{ id: 'h3', label: 'Small heading', example: '### text' },
	{ id: 'subtext', label: 'Subtext', example: '-# text' },
	{ id: 'quote', label: 'Quote', example: '> text' },
	{ id: 'ansi', label: 'ANSI colour', example: 'Colours in an ```ansi block' },
]

/**
 * Hands the settings to native, which restyles open message boxes straight away. JS owns the
 * values (`jsonStorage`); native only keeps what it was last told. Async: nothing needs the
 * result before a render, and a sync call would block the JS thread.
 */
export function setSettings(settings: LiveMarkdownStorage): Promise<null> {
	return callNativeMethod('bleelblep.live-markdown.setSettings', [settings])
}

declare module '@valenced/modules/native' {
	interface NativeMethods {
		'bleelblep.live-markdown.setSettings': [
			[settings: LiveMarkdownStorage],
			null,
		]
	}
}
