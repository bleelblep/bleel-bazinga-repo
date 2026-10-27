// SPDX-License-Identifier: GPL-3.0-only
//
// Copied from everestmcarthur/revenge-next-plugs-dev (the Themeify plugin),
// https://github.com/everestmcarthur/revenge-next-plugs-dev/blob/a43f367/plugins/themeify/src/lib/parser.ts
// (`RAW_COLOR_ALIASES` and the alias-filling loop at the end of `parseTheme`).
// Copyright (C) Themeify's authors (Rosie; commits by "Ally Founder"), licensed GPL-3.0. Full
// license text: ../THIRD_PARTY_LICENSES/GPL-3.0.txt
//
// The table is unchanged. The loop is the same logic, moved into its own function that returns
// what it filled instead of writing into the theme. This file is therefore licensed GPL-3.0,
// unlike the rest of this plugin. See NOTICE.md in this plugin's directory.

/** Discord's old grey ramp (PRIMARY_*, PLUM_*) and the NEUTRAL_* ramp that replaced it, both ways. */
export const RAW_COLOR_ALIASES: Record<string, string[]> = {
	// NEUTRAL -> PRIMARY / PLUM / WHITE / BLACK
	NEUTRAL_1: ['PRIMARY_100', 'WHITE_500', 'WHITE'],
	NEUTRAL_2: ['PRIMARY_200', 'WHITE_500'],
	NEUTRAL_3: ['PRIMARY_200'],
	NEUTRAL_4: ['PRIMARY_300', 'PRIMARY_330'],
	NEUTRAL_5: ['PRIMARY_300', 'PRIMARY_360'],
	NEUTRAL_10: ['PRIMARY_400'],
	NEUTRAL_20: ['PRIMARY_500'],
	NEUTRAL_30: ['PRIMARY_530'],
	NEUTRAL_40: ['PRIMARY_560'],
	NEUTRAL_50: ['PRIMARY_600'],
	NEUTRAL_60: ['PRIMARY_630'],
	NEUTRAL_66: ['PRIMARY_630', 'PRIMARY_660'],
	NEUTRAL_69: ['PRIMARY_660'],
	NEUTRAL_70: ['PRIMARY_660'],
	NEUTRAL_72: ['PRIMARY_660'],
	NEUTRAL_73: ['PRIMARY_660', 'PLUM_21'],
	NEUTRAL_74: ['PRIMARY_630', 'PLUM_17'],
	NEUTRAL_80: ['PRIMARY_700', 'PRIMARY_730'],
	NEUTRAL_82: ['PRIMARY_700', 'PLUM_20'],
	NEUTRAL_83: ['PRIMARY_700', 'PLUM_20'],
	NEUTRAL_86: ['PRIMARY_730', 'PRIMARY_800', 'PLUM_24'],
	NEUTRAL_90: ['PRIMARY_800', 'PLUM_24'],
	NEUTRAL_92: ['PRIMARY_800', 'PLUM_18', 'PLUM_24', 'PLUM_25'],
	NEUTRAL_95: ['PRIMARY_830', 'PLUM_22', 'PLUM_25'],
	NEUTRAL_97: ['PRIMARY_860', 'PLUM_26'],
	NEUTRAL_99: ['PRIMARY_900'],
	NEUTRAL_100: ['BLACK_500', 'BLACK'],

	// PRIMARY -> NEUTRAL / PLUM
	PRIMARY_100: ['NEUTRAL_1', 'NEUTRAL_2', 'WHITE_500'],
	PRIMARY_200: ['NEUTRAL_2', 'NEUTRAL_3'],
	PRIMARY_300: ['NEUTRAL_4', 'NEUTRAL_5'],
	PRIMARY_330: ['NEUTRAL_4'],
	PRIMARY_360: ['NEUTRAL_5', 'NEUTRAL_10'],
	PRIMARY_400: ['NEUTRAL_10'],
	PRIMARY_500: ['NEUTRAL_20'],
	PRIMARY_530: ['NEUTRAL_30'],
	PRIMARY_560: ['NEUTRAL_40'],
	PRIMARY_600: ['NEUTRAL_66', 'NEUTRAL_70', 'NEUTRAL_72', 'PLUM_16'],
	PRIMARY_630: ['NEUTRAL_74', 'NEUTRAL_60', 'PLUM_17'],
	PRIMARY_660: ['NEUTRAL_70', 'NEUTRAL_73', 'PLUM_19', 'PLUM_21'],
	PRIMARY_700: ['NEUTRAL_82', 'NEUTRAL_83', 'NEUTRAL_80', 'PLUM_20'],
	PRIMARY_730: ['NEUTRAL_86', 'PLUM_21'],
	PRIMARY_800: ['NEUTRAL_90', 'NEUTRAL_92', 'PLUM_24'],
	PRIMARY_830: ['NEUTRAL_95', 'PLUM_25'],
	PRIMARY_860: ['NEUTRAL_97', 'PLUM_26'],
	PRIMARY_900: ['NEUTRAL_99', 'NEUTRAL_100', 'BLACK_500'],

	// PLUM -> NEUTRAL / PRIMARY
	PLUM_16: ['PRIMARY_600', 'NEUTRAL_66'],
	PLUM_17: ['PRIMARY_630', 'NEUTRAL_74'],
	PLUM_18: ['PRIMARY_700', 'NEUTRAL_82'],
	PLUM_19: ['PRIMARY_660', 'NEUTRAL_70'],
	PLUM_20: ['PRIMARY_700', 'NEUTRAL_83'],
	PLUM_21: ['PRIMARY_730', 'NEUTRAL_86'],
	PLUM_22: ['PRIMARY_800', 'NEUTRAL_90'],
	PLUM_23: ['PRIMARY_800', 'NEUTRAL_92'],
	PLUM_24: ['PRIMARY_800', 'NEUTRAL_92', 'NEUTRAL_86'],
	PLUM_25: ['PRIMARY_830', 'NEUTRAL_95'],
	PLUM_26: ['PRIMARY_860', 'NEUTRAL_97'],

	// WHITE & BLACK
	WHITE: ['WHITE_500', 'NEUTRAL_1'],
	WHITE_500: ['WHITE', 'NEUTRAL_1'],
	BLACK: ['BLACK_500', 'NEUTRAL_100'],
	BLACK_500: ['BLACK', 'NEUTRAL_100'],
}

/**
 * The raw colours a theme doesn't set but can be taken from one it does, per the table above.
 * Earlier fills feed later lookups, as in the original loop. `raw` is not modified.
 */
export function aliasRawColors(raw: Record<string, string>): Record<string, string> {
	const working = { ...raw }
	const filled: Record<string, string> = {}
	for (const [key, aliases] of Object.entries(RAW_COLOR_ALIASES)) {
		if (!working[key]) {
			for (const alias of aliases) {
				if (working[alias]) {
					working[key] = working[alias]
					filled[key] = working[alias]
					break
				}
			}
		}
	}
	return filled
}
