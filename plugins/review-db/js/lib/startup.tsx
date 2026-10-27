/*
 * Ported from Vencord's reviewDB plugin (src/plugins/reviewDB/index.tsx, `start`).
 * Copyright (c) 2023 Vendicated and contributors. GPL-3.0-or-later; see ../../NOTICE.md.
 *
 * After sign-in and a few seconds after startup: refresh the ReviewDB account (username, block
 * list, admin flag), toast about new reviews on your profile, and show any pending ReviewDB notice
 * (warning, ban, unban) once, with an Appeal button for bans.
 */

import { getCurrentUserInfo, readNotification } from './api'
import { openURL, TAG, toast } from './discord'
import { NotificationType } from './entities'
import { getToken, setSetting, settings, updateAuth } from './state'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { reportError } from '../../../../shared/report'

export async function refreshUser({ notify = false } = {}) {
	if (!getToken()) return
	const user = await getCurrentUserInfo()
	if (!user) return
	updateAuth({ user })

	if (!notify) return

	const { notifyReviews, lastReviewId } = settings()
	if (notifyReviews && lastReviewId && lastReviewId < user.lastReviewID && user.lastReviewID !== 0) {
		toast('You have new reviews on your profile!')
	}
	// Desktop only writes it when it's already set, so the first run never records a baseline.
	// Record it every time instead, or the toast could never fire.
	if (user.lastReviewID) setSetting('lastReviewId', user.lastReviewID)

	const { notification } = user
	if (notification) {
		showNotice(notification.title, notification.content, notification.type === NotificationType.Ban)
		readNotification(notification.id)
	}
}

function showNotice(title: string, content: string, isBan: boolean) {
	try {
		const { AlertModal, AlertActionButton } = Design as any
		const Alerts = AlertActionCreators
		const key = 'ReviewDB-notice'
		Alerts.openAlert(
			key,
			<AlertModal
				title={title}
				content={content}
				actions={
					<>
						<AlertActionButton text="OK" variant="primary" onPress={() => Alerts.dismissAlert(key)} />
						{isBan ? (
							<AlertActionButton
								text="Appeal"
								variant="secondary"
								onPress={() => {
									Alerts.dismissAlert(key)
									const token = getToken()
									if (token)
										openURL(
											`https://reviewdb.mantikafasi.dev/api/redirect?token=${encodeURIComponent(token)}&page=${encodeURIComponent('dashboard/appeal')}`,
										)
								}}
							/>
						) : null}
					</>
				}
			/>,
		)
	} catch (error) {
		reportError(`${TAG} could not show notice:`, error)
		toast(`${title}: ${content}`.slice(0, 160))
	}
}
