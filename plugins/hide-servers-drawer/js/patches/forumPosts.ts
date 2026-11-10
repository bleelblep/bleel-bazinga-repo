/**
 * Hides forum posts, only on this device.
 *
 * A forum draws its posts outside the channel list, as one `ForumPost` per post inside a
 * `ForumPostContainer` (`modules/forums/native/ForumPost.tsx` and `posts/ForumPostContainer.tsx`,
 * paths read from the 352.6 bundle on 2026-11-08). Both are wrapped so a hidden post renders
 * nothing; whichever one carries the post's id does the hiding. The post is hidden from its
 * long-press sheet (patches/channelSheet.tsx), the same as a thread, since a post is a thread.
 *
 * The wrapper re-renders when the hidden list changes, so a post goes as soon as it's hidden.
 */

import { isChannelHidden, onChannelsChange } from "../lib/hidden"
import { getModuleByPath } from "../../../../shared/modules"
import { reportError } from "../../../../shared/report"
import * as react from "@valenced/react"

const TAG = "[HideServersDrawer:forumPosts]"
const PATHS = ["modules/forums/native/ForumPost.tsx", "modules/forums/native/posts/ForumPostContainer.tsx"]
// Logs each component's prop names once, to check where the post id sits. Off for release.
const DEBUG_PROPS: boolean = false

/**
 * Where a component's render function lives: a plain function export, or inside a memo (`type`)
 * or forwardRef (`render`), which can be nested (memo(forwardRef(fn))). 1.8.12 only looked one
 * level deep, and ForumPostContainer on 352.6 is wrapped deeper, so every forum open reported
 * "isn't a function component" (Bazinga bug report, 2026-11-10).
 */
function renderSlot(host: any, key: string): { holder: any; key: string } | undefined {
	let holder = host
	let slot = key
	for (let depth = 0; depth < 4; depth++) {
		const value = holder?.[slot]
		if (typeof value === "function") return value.prototype?.isReactComponent ? undefined : { holder, key: slot }
		if (!value || typeof value !== "object") return undefined
		if (value.type) slot = "type"
		else if (value.render) slot = "render"
		else return undefined
		holder = value
	}
	return undefined
}

/** The default export's render function, or else the first named export that is a component. */
function findRender(mod: any): { holder: any; key: string } | undefined {
	const found = renderSlot(mod, "default")
	if (found) return found
	for (const name of Object.keys(mod ?? {})) {
		if (name === "default" || !/^[A-Z]/.test(name)) continue
		const named = renderSlot(mod, name)
		if (named) return named
	}
	return undefined
}

/** The post's id, from whichever prop this component gets it in. */
function postId(props: any): string | undefined {
	const id = props?.threadId ?? props?.postId ?? props?.thread?.id ?? props?.channel?.id ?? props?.post?.id ?? props?.item?.id
	return typeof id === "string" ? id : undefined
}

/** Re-renders the caller whenever a channel, thread or post is hidden or shown. */
function useHiddenVersion() {
	const { React } = react
	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => onChannelsChange(bump), [])
}

export default function patchForumPosts(): () => void {
	const restores: Array<() => void> = []

	for (const path of PATHS) {
		restores.push(
			getModuleByPath(
				path,
				null,
				(mod: any) => {
					const slot = findRender(mod)
					if (!slot) {
						// The other path still hides posts; a shape we can't wrap isn't the user's problem.
						if (DEBUG_PROPS) console.warn(`${TAG} ${path}: no function component found`)
						return
					}
					const { holder, key } = slot
					const original = holder[key]
					let logged = false
					// Discord's component runs as a child, so its hooks never change count when a
					// post is hidden and shown again (returning early in the same component would).
					const Post = (inner: { props: any; forwarded: any }) => original(inner.props, inner.forwarded)
					holder[key] = function HideForumPost(props: any, forwarded: any) {
						const { React } = react
						useHiddenVersion()
						try {
							if (DEBUG_PROPS && !logged) {
								logged = true
								console.log(`${TAG} ${path} props: ${Object.keys(props ?? {}).join(", ")}`)
							}
							const id = postId(props)
							if (id && isChannelHidden(id)) return null
						} catch (error) {
							reportError(`${TAG} hiding a post failed:`, error)
						}
						return React.createElement(Post, { props, forwarded })
					}
					restores.push(() => {
						if (holder[key] !== original) holder[key] = original
					})
				},
				TAG,
			),
		)
	}

	return () => {
		for (const restore of restores.reverse()) {
			try {
				restore()
			} catch {
				/* already gone */
			}
		}
	}
}
