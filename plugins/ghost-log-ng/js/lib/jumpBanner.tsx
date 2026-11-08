/*
 * A tappable "message deleted" notice that jumps to the message.
 *
 * Discord's own toast can't do this: its components (design/mana/components/Toast, 352.2) read no
 * press handler, and how long it stays comes from Discord's own Toast duration setting. So when
 * Logging > Tap the notice to jump is on, Ghost Log draws a notice in the same spot and style,
 * for 6 seconds.
 *
 * It's drawn beside Discord's toast container (modules/toast/native/AppToastContainer.tsx, whose
 * `default` is mounted once over the whole app), which is the one place a plugin can add something
 * that floats over every screen. If that module isn't found or never renders, `showJumpBanner`
 * answers false and the caller shows Discord's normal toast, so a catch is never silent.
 *
 * Purely local: tapping only navigates, like tapping a message link.
 */

import { Design } from "@valenced/discord/design";
import { after } from "@valenced/patcher";
import * as React from "react";
import * as ReactNative from "react-native";
import { getModuleByPath } from "../../../../shared/modules";
import { reportError } from "../../../../shared/report";
import { token } from "../ui/theme";
import { jumpToDeletedMessage } from "./navigate";

const TAG = "[GhostLogNG:banner]";
const SHOW_MS = 6000;

export interface JumpTarget {
	id: string;
	channelId: string;
	guildId?: string;
}

interface Banner {
	key: number;
	text: string;
	target: JumpTarget;
}

let current: Banner | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let hostMounted = false;
let counter = 0;
const listeners = new Set<() => void>();

function notify() {
	for (const fn of listeners) fn();
}

function hide() {
	if (hideTimer !== undefined) clearTimeout(hideTimer);
	hideTimer = undefined;
	current = undefined;
	notify();
}

/** Shows the notice. False when it can't be drawn here, so the caller falls back to a toast. */
export function showJumpBanner(text: string, target: JumpTarget): boolean {
	if (!hostMounted) return false;
	if (hideTimer !== undefined) clearTimeout(hideTimer);
	current = { key: ++counter, text, target };
	hideTimer = setTimeout(hide, SHOW_MS);
	notify();
	return true;
}

function BannerHost() {
	const { View, Pressable } = ReactNative;
	const { Text } = Design as any;
	const [, setTick] = React.useState(0);

	React.useEffect(() => {
		hostMounted = true;
		const listener = () => setTick((n) => n + 1);
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
			if (!listeners.size) hostMounted = false;
		};
	}, []);

	const banner = current;
	if (!banner) return null;
	return (
		<View
			pointerEvents="box-none"
			style={{
				position: "absolute",
				top: 48,
				left: 16,
				right: 16,
				alignItems: "center",
			}}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityHint="Opens the deleted message"
				onPress={() => {
					const target = banner.target;
					hide();
					try {
						jumpToDeletedMessage(target);
					} catch (error) {
						reportError(`${TAG} jump failed:`, error);
					}
				}}
				style={{
					backgroundColor: token("BACKGROUND_SURFACE_HIGHEST", "#3f4147"),
					borderColor: token("BORDER_SUBTLE", "#4e5058"),
					borderWidth: 1,
					borderRadius: 24,
					paddingHorizontal: 16,
					paddingVertical: 10,
					maxWidth: 480,
				}}
			>
				<Text variant="text-sm/medium" color="text-default" numberOfLines={2}>
					{banner.text}
				</Text>
				<Text variant="text-xs/normal" color="text-muted">
					Tap to open it
				</Text>
			</Pressable>
		</View>
	);
}

/** Puts the host beside Discord's toast container. Returns its cleanup. */
export function installJumpBanner(): () => void {
	const unpatches: Array<() => void> = [];
	const unfind = getModuleByPath(
		"modules/toast/native/AppToastContainer.tsx",
		null,
		(mod: any) => {
			if (typeof mod?.default !== "function") return;
			unpatches.push(
				// `after` gets only the return value (coding rule 2): return it on every path.
				after(mod, "default", (rendered: any) => {
					try {
						return (
							<>
								{rendered}
								<BannerHost />
							</>
						);
					} catch (error) {
						reportError(`${TAG} could not add the notice:`, error);
						return rendered;
					}
				}),
			);
		},
		TAG,
	);
	return () => {
		unfind();
		for (const unpatch of unpatches.splice(0)) {
			try {
				unpatch();
			} catch {
				/* already gone */
			}
		}
		hide();
		hostMounted = false;
	};
}
