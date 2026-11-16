/**
 * The round picture on a history row.
 *
 * A person Discord still has loaded gets Discord's own `Avatar` (design/void/Avatar, present on
 * 352.2; props as in ReviewDB's js/ui/native.tsx), inside an error boundary. Everyone else, and every
 * server and group, is drawn by hand from the icon hash saved at the time, with the first letter
 * on a theme-coloured circle when there is no picture (docs/settings-design-guide.md §3.7).
 *
 * Images come from Discord's public CDN with no account attached (AS-02).
 */

import { Stores } from '@valenced/discord/flux'
import * as finders from '@valenced/discord/utils/modules/finders'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../../shared/report'
import { fileUri } from '../../lib/avatars'
import { TAG } from '../../lib/tag'
import { token } from '../theme'

const SIZE = 32

let avatarModule: any
function discordAvatar(): any {
	if (avatarModule === undefined) {
		try {
			avatarModule =
				(finders as any).lookupModuleWithImportedPath(
					'design/void/Avatar/native/Avatar.tsx',
				)?.[0] ?? null
		} catch {
			avatarModule = null
		}
	}
	return avatarModule
}

let Boundary: any
/** Built on first use: React may not exist yet at module scope (coding rule 1). */
function boundary(): any {
	if (Boundary) return Boundary
	Boundary = class extends (
		React.Component<{ fallback: any; children?: any }, { failed: boolean }>
	) {
		state = { failed: false }
		static getDerivedStateFromError() {
			return { failed: true }
		}
		componentDidCatch(error: unknown) {
			reportError(`${TAG} Discord's avatar failed; using the plain one:`, error)
		}
		render() {
			return this.state.failed ? this.props.fallback : this.props.children
		}
	}
	return Boundary
}

export type AvatarKind = 'user' | 'guild' | 'group'

function cdn(kind: AvatarKind, id: string, hash: string): string {
	const folder =
		kind === 'user' ? 'avatars' : kind === 'guild' ? 'icons' : 'channel-icons'
	return `https://cdn.discordapp.com/${folder}/${id}/${hash}.png?size=128`
}

interface Props {
	kind: AvatarKind
	id: string
	hash?: string
	name: string
	/** A copy saved on this phone (lib/avatars.ts), shown first. */
	file?: string
	size?: number
	/** Draw this exact picture, not the person's current one from Discord. */
	fixed?: boolean
}

function Plain({ kind, id, hash, name, file, size = SIZE }: Props) {
	const { Image, Text, View } = ReactNative
	// 0: the saved copy, 1: Discord's CDN, 2: the letter.
	const [step, setStep] = React.useState(0)
	const saved = file ? fileUri(file) : undefined
	const uri =
		step === 0 && saved
			? saved
			: step <= 1 && hash
				? cdn(kind, id, hash)
				: undefined
	if (uri) {
		return (
			<Image
				source={{ uri }}
				onError={() => setStep(uri === saved ? 1 : 2)}
				style={{ width: size, height: size, borderRadius: size / 2 }}
			/>
		)
	}
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: token('BACKGROUND_MOD_STRONG', '#4e5058'),
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			<Text
				style={{
					color: token('TEXT_DEFAULT', '#dbdee1'),
					fontSize: size * 0.42,
					fontWeight: '600',
				}}
			>
				{([...(name ?? '')][0] ?? '?').toUpperCase()}
			</Text>
		</View>
	)
}

export default function Avatar(props: Props) {
	const fallback = <Plain {...props} />
	if (props.kind !== 'user' || props.fixed || props.file) return fallback

	let user: any
	try {
		user = (Stores as any).UserStore?.getUser?.(props.id)
	} catch {
		user = undefined
	}
	const mod = discordAvatar()
	const Component = mod?.default
	const size = mod?.AvatarSizes?.SMALL
	if (!user || !Component || size === undefined) return fallback

	const B = boundary()
	return (
		<B fallback={fallback}>
			<Component user={user} size={size} animate={false} />
		</B>
	)
}
