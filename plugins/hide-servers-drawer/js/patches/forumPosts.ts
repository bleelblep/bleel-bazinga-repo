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
const DEBUG_PROPS: boolean = true

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
					const exported = mod?.default
					// Plain function, or a memo/forwardRef holding one.
					const holder = typeof exported === "function" ? mod : exported?.type ? exported : exported?.render ? exported : undefined
					const key = holder === mod ? "default" : exported?.type ? "type" : "render"
					const original = holder?.[key]
					if (typeof original !== "function" || original.prototype?.isReactComponent) throw new Error(`${path} isn't a function component`)
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
