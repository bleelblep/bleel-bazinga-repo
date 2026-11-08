/**
 * Discord's own components for the log screens: `Avatar`, `BotTag`, `EmptyState` and its generated
 * icons. Module paths and props as read from the 348.5 bundle for ReviewDB (plugins/review-db/js/ui/
 * native.tsx, the reference for docs/plugin-design-language.md §3.7), still present in 349.5.
 *
 * Each is looked up when first rendered, never at module scope, and every use goes through `Native`,
 * which draws the plain `fallback` when the component is missing or throws. A renamed prop costs
 * the look, not the screen.
 */

import { getAssetIdByName } from "@valenced/assets";
import { Design } from "@valenced/discord/design";
import { Stores } from "@valenced/discord/flux";
import * as finders from "@valenced/discord/utils/modules/finders";
import { lookupGeneratedIconComponent } from "@valenced/utils/discord";
import * as React from "react";
import * as ReactNative from "react-native";
import { reportError } from "../../../../shared/report";
import { token } from "./theme";

const TAG = "[GhostLogNG]";

function byPath(path: string): any {
	try {
		return (finders as any).lookupModuleWithImportedPath(path)?.[0];
	} catch {
		return undefined;
	}
}

const found: Record<string, any> = {};
function cached(key: string, find: () => any): any {
	if (!found[key]) found[key] = find();
	return found[key];
}

const avatarModule = () =>
	cached("avatar", () => byPath("design/void/Avatar/native/Avatar.tsx"));
const botTagModule = () =>
	cached("botTag", () => byPath("modules/applications/native/BotTag.tsx"));
const emptyState = () =>
	cached("empty", () => {
		const mod = byPath("design/void/EmptyState/native/EmptyState.tsx");
		return mod?.default ?? mod?.EmptyState;
	});

let Boundary: any;
function boundary(): any {
	if (Boundary) return Boundary;
	Boundary = class extends (
		React.Component<
			{ name: string; fallback: any; children?: any },
			{ failed: boolean }
		>
	) {
		state = { failed: false };
		static getDerivedStateFromError() {
			return { failed: true };
		}
		componentDidCatch(error: unknown) {
			reportError(
				`${TAG} Discord's ${this.props.name} failed; using the plain version:`,
				error,
			);
		}
		render() {
			return this.state.failed ? this.props.fallback : this.props.children;
		}
	};
	return Boundary;
}

/** Discord's component when `available`, guarded; otherwise the fallback. */
export function Native({
	name,
	available,
	fallback,
	children,
}: {
	name: string;
	available: boolean;
	fallback: any;
	children: any;
}) {
	if (!available) return fallback;
	const B = boundary();
	return (
		<B name={name} fallback={fallback}>
			{children}
		</B>
	);
}

function stores(): any {
	return Stores as any;
}

function cdnAvatar(userId: string, hash?: string): string {
	if (hash)
		return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=128`;
	// Discord's default avatars, picked from the id the way the client does for new usernames.
	let index = 0;
	try {
		// BigInt() rather than `22n` literals, which the bundler's target may not accept.
		index = Number((BigInt(userId) >> BigInt(22)) % BigInt(6));
	} catch {
		/* not a snowflake */
	}
	return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

type AvatarSize = "XSMALL" | "SMALL" | "NORMAL" | "LARGE";
const PIXELS: Record<AvatarSize, number> = {
	XSMALL: 24,
	SMALL: 32,
	NORMAL: 40,
	LARGE: 48,
};

/**
 * Discord's avatar. Someone Discord has loaded is passed as their record, so decorations come with
 * it; anyone else is drawn from the avatar hash captured with the message.
 */
export function UserAvatar({
	userId,
	hash,
	size = "NORMAL",
}: {
	userId: string;
	hash?: string;
	size?: AvatarSize;
}) {
	const { Image } = ReactNative;
	const [failed, setFailed] = React.useState(false);
	const px = PIXELS[size];
	const uri = cdnAvatar(userId, failed ? undefined : hash);
	const fallback = (
		<Image
			source={{ uri }}
			onError={() => setFailed(true)}
			style={{ width: px, height: px, borderRadius: px / 2 }}
		/>
	);
	const mod = avatarModule();
	const Avatar = mod?.default;
	const sizeValue = mod?.AvatarSizes?.[size];
	let user: any;
	try {
		user = stores().UserStore?.getUser?.(userId);
	} catch {
		user = undefined;
	}
	return (
		<Native
			name="Avatar"
			available={!!Avatar && sizeValue !== undefined}
			fallback={fallback}
		>
			{Avatar ? (
				user ? (
					<Avatar user={user} size={sizeValue} animate={false} />
				) : (
					<Avatar source={{ uri }} size={sizeValue} animate={false} />
				)
			) : null}
		</Native>
	);
}

/** A server's icon, or its initials on a plain circle, like the server list draws an iconless one. */
export function GuildIcon({
	id,
	hash,
	name,
	size = 16,
}: {
	id?: string;
	hash?: string;
	name: string;
	size?: number;
}) {
	const { Image, View, Text } = ReactNative;
	if (id && hash) {
		const uri = `https://cdn.discordapp.com/icons/${id}/${hash}.png?size=64`;
		return (
			<Image
				source={{ uri }}
				style={{ width: size, height: size, borderRadius: size / 3 }}
			/>
		);
	}
	const initials = name
		.split(/\s+/)
		.map((word) => word[0] ?? "")
		.join("")
		.slice(0, 2);
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: size / 3,
				backgroundColor: token("BACKGROUND_MOD_STRONG", "#4e5058"),
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Text
				style={{
					color: token("TEXT_DEFAULT", "#dbdee1"),
					fontSize: size * 0.45,
					fontWeight: "600",
				}}
			>
				{initials}
			</Text>
		</View>
	);
}

/** Discord's APP tag for a bot author. Nothing when the tag can't be found: it is decoration. */
export function BotTag() {
	const mod = botTagModule();
	const Tag = mod?.default;
	const value = mod?.Types?.BOT;
	return (
		<Native
			name="BotTag"
			available={!!Tag && value !== undefined}
			fallback={null}
		>
			{Tag ? <Tag type={value} /> : null}
		</Native>
	);
}

export function Empty({ title, body }: { title: string; body: string }) {
	const { View } = ReactNative;
	const { Text } = Design as any;
	const Component = emptyState();
	const fallback = (
		<View
			style={{
				paddingVertical: 48,
				paddingHorizontal: 32,
				alignItems: "center",
				gap: 8,
			}}
		>
			<Text
				variant="heading-md/semibold"
				color="text-default"
				style={{ textAlign: "center" }}
			>
				{title}
			</Text>
			<Text
				variant="text-sm/normal"
				color="text-muted"
				style={{ textAlign: "center" }}
			>
				{body}
			</Text>
		</View>
	);
	return (
		<Native name="EmptyState" available={!!Component} fallback={fallback}>
			{Component ? (
				<Component
					title={title}
					body={body}
					style={{ paddingVertical: 48, paddingHorizontal: 16 }}
				/>
			) : null}
		</Native>
	);
}

/**
 * One of Discord's icons, inline. Generated components first (the newer set), then registry assets
 * tinted with `color`. Nothing at all when neither exists: every use is decoration.
 */
export function Glyph({
	name,
	color,
	size = 16,
}: {
	name: string;
	color: string;
	size?: number;
}) {
	const { Image } = ReactNative;
	let Component: any;
	try {
		Component = lookupGeneratedIconComponent?.(name);
	} catch {
		Component = undefined;
	}
	if (Component) {
		return (
			<Native name={name} available fallback={null}>
				<Component
					size={
						size <= 12 ? "xxs" : size <= 16 ? "xs" : size <= 20 ? "sm" : "md"
					}
					color={color}
				/>
			</Native>
		);
	}
	let asset: number | undefined;
	try {
		const id = getAssetIdByName(name);
		asset = typeof id === "number" ? id : undefined;
	} catch {
		asset = undefined;
	}
	return asset !== undefined ? (
		<Image
			source={asset}
			style={{ width: size, height: size, tintColor: color }}
		/>
	) : null;
}
