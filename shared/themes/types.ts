/** Vendetta's theme format. `semanticColors` values are `[dark, light]`. */
export interface VendettaThemeManifest {
	spec: 2
	name: string
	description?: string
	authors?: Array<{ name: string; id?: string }>
	semanticColors?: Record<string, Array<string | false>>
	rawColors?: Record<string, string>
	background?: { url: string; blur?: number; alpha?: number }
	/** Themes+'s extras (nexpid/ThemesPlus `docs/PLUS-VERSION-0.md`), see `lib/plus.ts`. */
	plus?: PlusData
	/** Set when the theme was converted from another app's format (`lib/aliucord.ts`). */
	origin?: ThemeOrigin
}

/**
 * A Themes+ colour: one `#hex` for every Discord theme, or `[dark, light, midnight]` where only dark
 * is required. Strings may also be `RC_<raw colour>` or `SC_<semantic colour>`.
 */
export type PlusColor = string | string[]

/** The `plus` section of a Themes+ theme, version 0. */
export interface PlusData {
	version?: number
	/** An icon pack id from Themes+'s list, like `solar`. */
	iconpack?: string
	/** Icon colours by asset name, like `HubIcon`. */
	icons?: Record<string, PlusColor>
	/** Deprecated by Themes+ in favour of raw `RED_400`, which is where it goes here. */
	unreadBadgeColor?: PlusColor
	/** The bar beside messages that mention you. */
	mentionLineColor?: PlusColor
	/** Extra colour layers on a few icons. Not supported; listed as not carried over. */
	customOverlays?: boolean
}

/** Where a converted theme came from, and what didn't survive the conversion. */
export interface ThemeOrigin {
	format: 'aliucord'
	version?: string
	/** Plain sentences for the theme page, e.g. "12 icon colours". */
	notes: string[]
	/** The theme's fonts, installed next to it as a font of its own. */
	font?: FontManifest
}

/** Bunny's theme format, which classic Revenge also reads. */
export interface BunnyThemeManifest {
	spec: 3
	type?: string
	name: string
	description?: string
	authors?: Array<{ name: string; id?: string }>
	main: {
		type?: 'dark' | 'light'
		semantic?: Record<string, string | { type: 'color' | 'raw'; value: string; opacity?: number }>
		raw?: Record<string, string>
		background?: { url: string; blur?: number; opacity?: number }
	}
	/** Set when the theme was converted from another app's format (`lib/aliucord.ts`). */
	origin?: ThemeOrigin
}

export type ThemeManifest = VendettaThemeManifest | BunnyThemeManifest

/** One installed theme. `id` is the URL it came from, as in classic. */
export interface InstalledTheme {
	id: string
	manifest: ThemeManifest
}

/**
 * Revenge's font format, the one RevengeXposed reads from `files/pyoncord/fonts.json`
 * (`FontDefinition` in its `tweaks/legacy/appearance/Fonts.kt`). `main` maps a font family name
 * Discord asks for, like `ggsans-Normal`, to the link of a .ttf or .otf file.
 */
export interface FontManifest {
	spec?: number
	name: string
	description?: string
	main: Record<string, string>
}

/** One installed font. `id` is the URL it came from, like a theme's. */
export interface InstalledFont {
	id: string
	manifest: FontManifest
}

/**
 * An icon pack in Themes+'s format (nexpid/ThemesPlus `iconpacks/list.json`). `load` is a folder
 * laid out like Discord's assets: an icon at `/assets/<path>/<name>.png` is at
 * `<load><path>/<name><suffix>.png`.
 */
export interface IconPack {
	id: string
	name: string
	description?: string
	credits?: { authors?: Array<{ name: string; id?: string }>; sources?: string[] }
	suffix?: string
	load: string
	/** Themes+'s per-pack options, like `biggerStatus`. Not used here. */
	config?: string
	/** Our addition for packs added by link: a text file listing the pack's icons, one path a line. */
	tree?: string
}

export type ThemeType = 'auto' | 'dark' | 'light'

export interface ThemesStorage {
	/** Written whole on every change: `set()` replaces arrays, and a removed theme must go (coding rule 6). */
	themes: InstalledTheme[]
	/** The applied theme's id, or `''` for Discord's own. */
	selected: string
	typeOverride: ThemeType
	showBackground: boolean
	/** The user's own chat background, for every theme; wins over a theme's (`lib/customBackground.ts`). */
	customBackground?: CustomBackground | null
	/** Discord's fade behind the message box (`patches/chatInputFade.ts`). Off = see-through. */
	chatInputFade: boolean
	/** Fill Discord 348's colour names from the old ones a theme sets (`lib/legacy.ts`). */
	translateLegacy: boolean
	/** Derive every colour the theme doesn't set from the ones it does (`lib/palette.ts`). */
	completePalette: boolean
	/** Read a theme's Themes+ section (`lib/plus.ts`). Off: those themes are plain Vendetta themes. */
	themesPlus?: boolean
	/** Install and use Aliucord themes (`lib/aliucord.ts`). */
	aliucordThemes?: boolean
	/** Give the strip under the message box the chat's colour (`lib/navBar.ts`). */
	matchNavBar?: boolean
	/** Set while the stored theme is applied at launch; still set next launch means that one died. */
	applyingAtLaunch: boolean
	/** The last launch skipped the theme because of the above. */
	skippedAtLaunch: boolean
	/** Discord build the theme last came up healthy on; a different one applies the theme late. */
	safeBuild: string
	/**
	 * Every Discord build a theme has come up on without a crash and with nothing Themes needs
	 * missing (`lib/health.ts`). A build not in here applies the theme late and says it's unchecked.
	 * Device-only: Cloud Backup leaves it out.
	 */
	checkedBuilds?: string[]
	/** What ended the last guarded launch, if it failed. */
	lastCrash: string
	debugLogging: boolean
	/** Written whole on every change, like `themes`. */
	fonts: InstalledFont[]
	/** The font in Revenge's fonts.json, or `''` for Discord's own. */
	selectedFont: string
	/** Our own packs (bleelblep/discord-icon-packs), as last downloaded. Shown above Themes+'s. */
	includedPackList?: IconPack[]
	/** Themes+'s list of packs, as last downloaded. */
	iconPackList: IconPack[]
	/** Packs added by link. Written whole, like `themes`. */
	iconPacks: IconPack[]
	/** The pack in use, by id, or `''` for Discord's own icons. */
	selectedIconPack: string
	/** The pack in use was picked by a Themes+ theme, not by the user (`lib/plus.ts`). */
	iconPackFromTheme?: boolean
	/** The user's own pack from before a Themes+ theme picked one, to put back. */
	iconPackBeforeTheme?: string
	/** The pack in use, whole, so launch needs no download. */
	iconPack?: IconPack
	/** The icons the pack in use has, as paths under Discord's assets. */
	iconTree: string[]
	/** Pixels per point in the pack in use, measured from one of its icons (72 px / 24 pt = 3). */
	iconScale?: number
	/**
	 * Which packs the Icons page lists, by id, as the user set them. Explicit `false` hides one:
	 * storage merges, so a key can't be removed (coding rule 6). A pack not in here is shown
	 * unless it's in `HIDDEN_BY_DEFAULT`.
	 */
	packShown?: Record<string, boolean>
	/** Every emoji pack ever downloaded, by id, so one still has a name if its source drops it. */
	emojiKnown?: Record<string, EmojiPack>
	/** Makers (`vendor:<name>`) and packs (by id) switched off on the Emoji pages; explicit `false` hides. */
	emojiShown?: Record<string, boolean>
}

/** One emoji font: from PoomSmart's EmojiFonts releases or zFont's host repository. */
export interface EmojiPack {
	/** Lowercase letters, digits and dashes, at most 40 (native names its file after it). */
	id: string
	name: string
	url: string
	/** Download size in MB. */
	size: number
	/** Whose artwork, and its licence where known. */
	art: string
	/** Free licence (true) or the maker's own artwork (false). */
	open: boolean
	/** Apple, Samsung, Google... the Emoji page's first level. */
	vendor: string
	/** The heading it sits under on its maker's page: Current or Classic. */
	group: string
	source: 'emojifonts' | 'zfont' | 'serenityos'
}

/** An image the user picked or linked, shown behind the chat whatever the theme. */
export interface CustomBackground {
	/** A file in Discord's files folder (from the gallery) or an https link. */
	uri: string
	/** 0-1: how much the chat's colour covers the image. */
	dim: number
	/** Blur radius, 0 = sharp. */
	blur: number
}

/** A theme reduced to what the engine applies. */
export interface ColorDefinition {
	type: 'dark' | 'light'
	semantic: Record<string, { value: string; opacity: number }>
	raw: Record<string, string>
	background?: { url: string; blur?: number; opacity?: number }
}
