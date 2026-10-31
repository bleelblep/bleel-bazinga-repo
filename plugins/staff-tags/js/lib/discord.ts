/**
 * The Discord pieces the patches share: typed store reads, the tag component's module and the
 * permission helper.
 *
 * The tag module and the permission helper are set from `start()` by `getModules`, which looks a
 * module up and keeps waiting for it. Until one arrives, readers get `undefined` and skip that tag
 * for this render; the next render picks it up. Nothing here caches a miss (coding rule 3).
 */

import { Stores } from '@valenced/discord/flux'
import type { DiscordModules } from '@valenced/discord/types'
import type { ReactNode } from 'react'

export interface Guild {
	id: string
	ownerId?: string
}

export interface Channel {
	id?: string
	guild_id?: string
	permissionOverwrites?: unknown
}

export interface User {
	id: string
	bot?: boolean
	isNonUserBot?(): boolean
}

/** What Discord's tag component takes, plus the props this plugin adds to draw a staff tag. */
export interface TagProps {
	type?: number
	text?: string
	textColor?: string
	backgroundColor?: string
	gradientColor?: string
	icon?: string
	customSvg?: string
	iconOnly?: boolean
	verified?: boolean
	style?: unknown
}

/** Discord's tag component. `Types` is its enum of built-in tags (BOT, SYSTEM, ...). */
export type TagComponent = ((props: TagProps) => ReactNode) & {
	Types?: Record<string, number>
}

/** The module exporting the tag component and `getBotLabel`. */
export interface TagModule {
	default: TagComponent
	getBotLabel?(type: number): unknown
}

type Store<T> = DiscordModules.Flux.Store<T>

/** Flux stores by name, cast to the methods this plugin calls (as Show Timeout Duration does). */
export const stores = {
	guild: () =>
		Stores.GuildStore as
			| Store<{ getGuild(id?: string): Guild | undefined }>
			| undefined,
	channel: () =>
		Stores.ChannelStore as
			| Store<{ getChannel(id?: string): Channel | undefined }>
			| undefined,
	selectedChannel: () =>
		Stores.SelectedChannelStore as
			| Store<{ getChannelId(): string | undefined }>
			| undefined,
	guildMember: () =>
		Stores.GuildMemberStore as
			| Store<{
					getMember(
						guildId: string,
						userId: string,
					): { colorString?: string } | undefined
			  }>
			| undefined,
}

let tagModule: TagModule | undefined

export function setTagModule(module: TagModule | undefined) {
	tagModule = module
}

export function getTagModule(): TagModule | undefined {
	return tagModule
}

/** Discord's permission helper. Its argument shape isn't documented; `getTag.ts` probes it. */
export type PermissionHelper = (...args: unknown[]) => unknown

let permissionHelper: PermissionHelper | undefined
let permissionRank = Number.POSITIVE_INFINITY

/**
 * Offers a permission helper. Lower [rank] wins, so `computePermissionsForMember` is kept over
 * plain `computePermissions` whichever loads first.
 */
export function offerPermissionHelper(helper: unknown, rank: number) {
	if (typeof helper !== 'function' || rank > permissionRank) return
	permissionHelper = helper as PermissionHelper
	permissionRank = rank
}

export function getPermissionHelper(): PermissionHelper | undefined {
	return permissionHelper
}

export function clearDiscordModules() {
	tagModule = undefined
	permissionHelper = undefined
	permissionRank = Number.POSITIVE_INFINITY
}

/** The function [key] on a module, whether it sits on the namespace or on `default` (coding rule 3). */
export function exportedFunction(exports: unknown, key: string): unknown {
	const own = (exports as Record<string, unknown> | undefined)?.[key]
	if (typeof own === 'function') return own
	return (exports as { default?: Record<string, unknown> } | undefined)
		?.default?.[key]
}

/** A lookup that is cached once it finds something, and tried again on the next call until then. */
export function whenFound<T>(
	resolve: () => T | undefined,
): () => T | undefined {
	let value: T | undefined
	return () => {
		if (value === undefined) value = resolve()
		return value
	}
}
