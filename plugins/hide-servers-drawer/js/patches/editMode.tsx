/**
 * Edit mode on Discord's own server bar (see lib/hidden.ts): every server shows, hidden ones are
 * darkened with a crossed-out eye, and a tap hides or shows one.
 *
 * Three stock components, found by path (traced in the 352.2 bundle):
 * - `GuildsBarGuild` (a memo, props `{ guildId, ... }`): each row gets an EditOverlay.
 * - `GuildsBarGuildFolder` (a memo, props `{ id, name, childNodes, ... }`): a hidden folder gets
 *   one too, so it can be shown again; a visible one gets an eye badge that hides the whole folder.
 * - `GuildsBarFooterWrapper` (a plain function, props `{ children }`): the bar's footer, where the
 *   eye button (or Done, in edit mode) goes above whatever Discord puts there.
 *
 * The stock bar itself is remounted on the way in and out (patches/guildsBar.ts), so it reads the
 * unfiltered list in edit mode and the filtered one after.
 */

import { isEditing, isFolderHidden, isHidden, onBarChange, setEditing, setFolderHidden, setHidden } from "../lib/hidden"
import { barButton } from "../lib/prefs"
import { goHome } from "./guildMenu"
import { getModuleByPath } from "../../../../shared/modules"
import { reportError } from "../../../../shared/report"
import { Stores } from "@valenced/discord/flux"
import * as assets from "@valenced/assets"
import { instead } from "@valenced/patcher"
import { createElement, useEffect, useReducer } from "react"
import * as ReactNative from "react-native"

const TAG = "[HideServersDrawer:editMode]"
const ROW = "modules/guilds_bar/native/GuildsBarGuild.tsx"
const FOLDER = "modules/guilds_bar/native/GuildsBarGuildFolder.tsx"
const FOOTER = "modules/guilds_bar/native/GuildsBarFooterWrapper.tsx"

const ITEM = 48
const BLURPLE = "#5865F2"

function useBarChanges() {
	const [, bump] = useReducer((n: number) => n + 1, 0)
	useEffect(() => onBarChange(bump), [])
}

const BADGE = 24

/**
 * Wraps a stock row. Outside edit mode it renders the row untouched. In edit mode it lays a
 * press target over the row, so a tap hides or shows it instead of opening it.
 *
 * A visible folder is the exception: its own tap still opens it, so the servers inside can be
 * picked one by one, and a small eye badge on its top-right corner hides the whole folder.
 */
function EditOverlay({ guildId, folderId, children }: { guildId?: string; folderId?: string | number; children: any }) {
	useBarChanges()
	if (!isEditing() || (guildId == null && folderId == null)) return children

	const { Pressable, View, Image, StyleSheet } = ReactNative
	const { getAssetIdByName } = assets
	const isFolder = guildId == null
	const hidden = isFolder ? isFolderHidden(folderId as any) : isHidden(guildId)

	const toggle = () => {
		if (isFolder) setFolderHidden(folderId as any, !hidden)
		else setHidden(guildId, !hidden)
	}

	if (isFolder && !hidden) {
		return (
			<View>
				{children}
				<Pressable
					onPress={toggle}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Hide this folder"
					style={{
						position: "absolute",
						top: -4,
						// The row is the bar's full width with the icon centred, so this lands on
						// the icon's top-right corner.
						left: "50%",
						marginLeft: ITEM / 2 - BADGE + 6,
						width: BADGE,
						height: BADGE,
						borderRadius: BADGE / 2,
						backgroundColor: "rgba(0, 0, 0, 0.75)",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<Image source={getAssetIdByName("EyeSlashIcon") ?? getAssetIdByName("ic_hide")} style={{ width: 14, height: 14, tintColor: "#fff" }} />
				</Pressable>
			</View>
		)
	}

	return (
		<View>
			{children}
			<Pressable
				onPress={toggle}
				style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}
				accessibilityRole="switch"
				accessibilityState={{ checked: !hidden }}
				accessibilityLabel={hidden ? "Hidden. Tap to show" : "Shown. Tap to hide"}
			>
				{hidden ? (
					<View
						style={{
							width: ITEM,
							height: ITEM,
							borderRadius: isFolder ? 16 : ITEM / 2,
							backgroundColor: "rgba(0, 0, 0, 0.6)",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<Image source={getAssetIdByName("EyeSlashIcon") ?? getAssetIdByName("ic_hide")} style={{ width: 22, height: 22, tintColor: "#fff" }} />
					</View>
				) : null}
			</Pressable>
		</View>
	)
}

function selectedGuildId(): string | undefined {
	try {
		const id = (Stores as any).SelectedGuildStore?.getGuildId?.()
		return typeof id === "string" ? id : undefined
	} catch {
		return undefined
	}
}

/** The eye in the footer: opens edit mode, and becomes Done while it's on. */
function EditButton() {
	useBarChanges()
	const editing = isEditing()
	if (!editing && !barButton()) return null

	const { Pressable, View, Image } = ReactNative
	const { getAssetIdByName } = assets

	const press = () => {
		if (editing) {
			// Leaving edit mode while in a server that's now hidden: go Home first, so the bar
			// never has a selected server it no longer lists.
			const id = selectedGuildId()
			if (id && isHidden(id)) goHome()
		}
		setEditing(!editing)
	}

	const icon = editing
		? (getAssetIdByName("CheckmarkLargeIcon") ?? getAssetIdByName("ic_check"))
		: (getAssetIdByName("EyeIcon") ?? getAssetIdByName("ic_eye"))

	return (
		<Pressable
			onPress={press}
			accessibilityRole="button"
			accessibilityLabel={editing ? "Done hiding servers" : "Hide or show servers"}
			style={{ alignItems: "center", marginBottom: 8 }}
		>
			<View
				style={{
					width: ITEM,
					height: ITEM,
					borderRadius: ITEM / 2,
					backgroundColor: editing ? BLURPLE : "rgba(128, 132, 142, 0.24)",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Image source={icon} style={{ width: 24, height: 24, tintColor: "#fff" }} />
			</View>
		</Pressable>
	)
}

function patchMemoRow(path: string, overlayProps: (props: any) => { guildId?: string; folderId?: string | number }, patches: Array<() => void>) {
	return getModuleByPath(
		path,
		null,
		(mod: any) => {
			const memo = mod?.default
			if (typeof memo?.type !== "function") {
				reportError(`${TAG} ${path} is not a memo component`)
				return
			}
			patches.push(
				instead(memo, "type", function (this: any, args: any[], original: any) {
					const out = Reflect.apply(original, this, args)
					try {
						return createElement(EditOverlay, { ...overlayProps(args[0] ?? {}), children: out })
					} catch (error) {
						reportError(`${TAG} wrapping a row failed:`, error)
						return out
					}
				}),
			)
		},
		TAG,
	)
}

export default function patchEditMode(): () => void {
	const patches: Array<() => void> = []

	const stops = [
		patchMemoRow(ROW, props => ({ guildId: typeof props.guildId === "string" ? props.guildId : undefined }), patches),
		patchMemoRow(FOLDER, props => ({ folderId: props.id }), patches),
		getModuleByPath(
			FOOTER,
			null,
			(mod: any) => {
				if (typeof mod?.default !== "function") {
					reportError(`${TAG} the bar footer has no function to hook`)
					return
				}
				patches.push(
					instead(mod, "default", function (this: any, args: any[], original: any) {
						const props = args[0] ?? {}
						const next = { ...props, children: [createElement(EditButton, { key: "hide-servers-edit" }), props.children] }
						return Reflect.apply(original, this, [next, ...args.slice(1)])
					}),
				)
			},
			TAG,
		),
	]

	return () => {
		setEditing(false)
		for (const stop of stops) stop()
		for (const unpatch of patches.splice(0)) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
