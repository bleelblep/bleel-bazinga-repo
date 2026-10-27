/*
 * Ported from Vencord's reviewDB plugin (src/plugins/reviewDB/auth.tsx).
 * Copyright (c) 2023 Vendicated and contributors. GPL-3.0-or-later; see ../../NOTICE.md.
 *
 * Desktop opens Discord's OAuth2AuthorizeModal with `openModal`. The mobile app has the same
 * component (modules/oauth2/native/OAuth2AuthorizeModal.tsx) and the same props; it is pushed on
 * the root navigator with `pushModal` instead. The exchange then adds `clientMod=vendetta`: ReviewDB
 * checks the value against its own list, and "vendetta" is the one it accepts from mobile mods.
 */

import { API_URL } from './api'
import { modals, OAuth2AuthorizeModal, TAG, toast } from './discord'
import { refreshUser } from './startup'
import { getToken, updateAuth } from './state'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

export const CLIENT_ID = '915703782174752809'
const CLIENT_MOD = 'vendetta'
const MODAL_KEY = 'reviewdb-oauth2-authorize'

async function exchange(location: string, callback?: () => void) {
	try {
		// Plain string building: React Native's URL has no working searchParams.append (it throws
		// "not implemented"), which is what desktop uses here.
		const sep = location.includes('?') ? '&' : '?'
		const url = `${location}${sep}returnType=json&clientMod=${CLIENT_MOD}`
		if (DEBUG) console.log(`${TAG} authorize: exchanging the Discord code with ReviewDB`)
		const res = await fetch(url, { headers: { Accept: 'application/json' } })
		const body = await res.json().catch(() => ({}) as any)

		if (!res.ok || !body?.token) {
			reportError(`${TAG} authorize: ReviewDB answered ${res.status}: ${body?.message ?? '(no message)'}`)
			toast(body?.message ?? 'An error occurred while authorizing')
			return
		}

		updateAuth({ token: body.token })
		if (DEBUG) console.log(`${TAG} authorize: signed in, token stored=${!!getToken()}`)
		refreshUser().catch(() => {})
		toast('Successfully logged in!')
		callback?.()
	} catch (error) {
		reportError(`${TAG} failed to authorize:`, error)
		toast('Authorization failed. Try again later.')
	}
}

/**
 * Signing in only ever goes through Discord's own authorize screen. Discord loads that screen
 * lazily, so on some sessions it isn't there yet; then this says so rather than making the
 * authorize request itself (account-safety rule AS-02: no hand-built Discord requests).
 */
export function authorize(callback?: () => void) {
	const api = modals()
	const Modal = OAuth2AuthorizeModal()
	if (!api || !Modal) {
		if (DEBUG) console.log(`${TAG} authorize: Discord's authorize screen isn't loaded`)
		toast("Couldn't open Discord's sign-in screen. Reading reviews still works.")
		return
	}

	const close = () => {
		try {
			api.popModal(MODAL_KEY)
		} catch {
			/* already closed */
		}
	}

	api.pushModal({
		key: MODAL_KEY,
		modal: {
			key: MODAL_KEY,
			modal: Modal,
			animation: 'slide-up',
			shouldPersistUnderModals: false,
			closable: true,
			props: {
				clientId: CLIENT_ID,
				redirectUri: `${API_URL}/auth`,
				scopes: ['identify'],
				responseType: 'code',
				permissions: 0n,
				cancelCompletesFlow: false,
				callback: ({ location }: { location: string }) => exchange(location, callback),
				dismissOAuthModal: close,
			},
		},
	})
}
