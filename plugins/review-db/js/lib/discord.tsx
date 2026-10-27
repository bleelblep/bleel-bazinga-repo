import { showToast } from '../../../../shared/toast'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import * as modulesFinders from '@valenced/discord/utils/modules/finders'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { Linking } from 'react-native'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false
/**
 * Discord pieces this plugin needs, looked up when first used (never at module scope, porting
 * rule 1). Each getter returns undefined instead of throwing, so a renamed module costs one
 * feature, not the plugin.
 */

export const TAG = '[ReviewDB]'

function byProps(...props: string[]): any {
	try {
		const { lookupModule } = finders
		const { withProps } = filters
		return lookupModule<any>((withProps as any)(...props))?.[0]
	} catch {
		return undefined
	}
}

function byPath(path: string): any {
	try {
		return (modulesFinders as any).lookupModuleWithImportedPath(path)?.[0]
	} catch {
		return undefined
	}
}

export function toast(content: string) {
	try {
		showToast(content, `ReviewDB-${Date.now()}`)
	} catch {
		if (DEBUG) console.log(`${TAG} ${content}`)
	}
}

let modalApi: any
/** `pushModal` / `popModal`: full-screen modals on the root navigator. */
export function modals(): { pushModal(options: any): void; popModal(key: string): void } | undefined {
	modalApi ??= byProps('pushModal', 'popModal')
	return modalApi
}

let oauthModal: any
export function OAuth2AuthorizeModal(): any {
	if (!oauthModal) {
		const mod = byPath('modules/oauth2/native/OAuth2AuthorizeModal.tsx')
		oauthModal = mod?.default ?? mod
		if (typeof oauthModal !== 'function') {
			try {
				const { lookupModule } = finders
				const { withName } = filters
				oauthModal = lookupModule<any>(withName('OAuth2AuthorizeModal'))?.[0]
			} catch {
				oauthModal = undefined
			}
		}
	}
	return typeof oauthModal === 'function' ? oauthModal : undefined
}

let profileSheet: any
export function openUserProfile(userId: string) {
	try {
		if (!profileSheet) {
			const mod = byPath('modules/user_profile/native/showUserProfileActionSheet.tsx')
			profileSheet = mod?.default ?? byProps('showUserProfileActionSheet')?.showUserProfileActionSheet
		}
		if (typeof profileSheet === 'function') {
			profileSheet({ userId })
			return true
		}
	} catch (error) {
		reportError(`${TAG} could not open profile:`, error)
	}
	return false
}

export function defaultAvatar(userId: string): string {
	try {
		const utils = byProps('getDefaultAvatarURL')
		const fn = utils?.default?.getDefaultAvatarURL ?? utils?.getDefaultAvatarURL
		const url = fn?.(userId)
		if (typeof url === 'string') return url
	} catch {
		/* fall through */
	}
	let index = 0
	try {
		index = Number((BigInt(userId) >> 22n) % 6n)
	} catch {
		/* not a snowflake */
	}
	return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}

export function openURL(url: string) {
	try {
		Linking.openURL(url)
	} catch (error) {
		reportError(`${TAG} could not open ${url}:`, error)
	}
}

export function isDiscordBlocked(userId: string): boolean {
	try {
		return !!(Stores as any).RelationshipStore?.isBlocked?.(userId)
	} catch {
		return false
	}
}

/** Discord's generated icon component by name, or undefined. */
export function icon(name: string): any {
	try {
		return lookupGeneratedIconComponent(name)
	} catch {
		return undefined
	}
}

/**
 * A confirm dialog in Discord's own alert style. `onConfirm` runs after the dialog closes.
 */
export function confirm(options: {
	title: string
	body: string
	confirmText: string
	cancelText?: string
	destructive?: boolean
	onConfirm(): void
	onCancel?(): void
}) {
	const { AlertModal, AlertActionButton } = Design as any
	const Alerts = AlertActionCreators
	const key = `ReviewDB-confirm-${Date.now()}`
	Alerts.openAlert(
		key,
		<AlertModal
			title={options.title}
			content={options.body}
			actions={
				<>
					<AlertActionButton
						text={options.confirmText}
						variant={options.destructive ? 'destructive' : 'primary'}
						onPress={() => {
							Alerts.dismissAlert(key)
							options.onConfirm()
						}}
					/>
					<AlertActionButton
						text={options.cancelText ?? 'Nevermind'}
						variant="secondary"
						onPress={() => {
							Alerts.dismissAlert(key)
							options.onCancel?.()
						}}
					/>
				</>
			}
		/>,
	)
}
