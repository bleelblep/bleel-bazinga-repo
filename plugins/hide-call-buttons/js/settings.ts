export interface HideCallButtonsStorage {
	upHideVoiceButton: boolean
	dmHideCallButton: boolean
	dmHideVideoButton: boolean
	hideVCVideoButton: boolean
	friendsHideCallButton: boolean
}

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start.
 *
 * Older storage may still hold `upHideVideoButton`. Profiles have no camera button, so nothing
 * reads it; `jsonStorage.set` can't delete a key (coding rule 6), so it is left in place.
 */
export const DEFAULTS: HideCallButtonsStorage = {
	// Same defaults as the original: profile call button hidden, DM and VC buttons kept.
	upHideVoiceButton: true,
	dmHideCallButton: false,
	dmHideVideoButton: false,
	hideVCVideoButton: false,
	friendsHideCallButton: false,
}
