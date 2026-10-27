/**
 * Wraps a settings page so a render error shows "This page couldn't load" instead of closing
 * Discord. A broken shared lookup (`valenced.discord.design.Design` coming back empty) crashed the
 * app from a settings page on 2026-10-06; any other render error would have done the same.
 *
 * Built on first use, because `React.Component` must not be read at module scope. Each page gets
 * one wrapper, kept, so the navigator sees the same component on every render.
 */

import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'
import type { ComponentType, FunctionComponent, ReactNode } from 'react'

const TAG = '[SendTweaks]'

interface BoundaryProps {
	children?: ReactNode
	name: string
}

interface BoundaryState {
	error: unknown
}

let Boundary: ComponentType<BoundaryProps> | undefined
const wrapped = new WeakMap<object, FunctionComponent<never>>()

function getBoundary(): ComponentType<BoundaryProps> {
	if (Boundary) return Boundary
	Boundary = class extends React.Component<BoundaryProps, BoundaryState> {
		state: BoundaryState = { error: undefined }
		static getDerivedStateFromError(error: unknown): BoundaryState {
			return { error: error ?? new Error('Unknown error') }
		}
		componentDidCatch(error: unknown) {
			reportError(`${TAG} ${this.props.name} page failed to render:`, error)
		}
		render() {
			if (this.state.error === undefined) return this.props.children
			// Only React Native's own parts here: Discord's may be what failed.
			const { View, Text } = ReactNative
			const message =
				this.state.error instanceof Error
					? this.state.error.message
					: String(this.state.error)
			return (
				<View style={{ padding: 16, gap: 8 }}>
					<Text style={{ fontSize: 16, fontWeight: '600', color: '#9a9aa2' }}>
						This page couldn't load
					</Text>
					<Text style={{ fontSize: 14, color: '#9a9aa2' }}>
						Something went wrong while drawing it. Discord is fine; go back and
						try again, or reload Discord. If it keeps happening, send the
						plugin's developer this error:
					</Text>
					<Text
						selectable
						style={{ fontSize: 12, color: '#9a9aa2', fontFamily: 'monospace' }}
					>
						{message}
					</Text>
				</View>
			)
		}
	}
	return Boundary
}

/**
 * `Page`, wrapped so a render error stays on the page. A function component, which is what
 * Valenced's `SettingsComponent` and Discord's settings routes both accept.
 */
export function safePage<P extends object>(
	Page: ComponentType<P>,
	name = Page.displayName || Page.name || 'Settings',
): FunctionComponent<P> {
	const existing = wrapped.get(Page) as FunctionComponent<P> | undefined
	if (existing) return existing
	const Safe: FunctionComponent<P> = props => {
		const Boundary = getBoundary()
		return (
			<Boundary name={name}>
				<Page {...props} />
			</Boundary>
		)
	}
	Safe.displayName = `SafePage(${name})`
	wrapped.set(Page, Safe as FunctionComponent<never>)
	return Safe
}
