import { staticIcons } from "../../lib/prefs"
import { avatarFallback } from "../theme"
import * as ReactNative from "react-native"

const SIZE = 36

/** Discord's fallback for a server with no icon: first letter of each word. */
function acronym(name: string): string {
	return String(name ?? "")
		.replace(/'s /g, " ")
		.replace(/\w+/g, word => word[0] ?? "")
		.replace(/\s/g, "")
		.slice(0, 3)
		.toUpperCase()
}

function iconUrl(guild: any): string | undefined {
	if (!guild?.icon) return undefined

	// Animated icons are prefixed a_ and normally need .gif -- but the CDN happily serves a
	// still frame of an animated icon at the same path with .png instead, so "disable
	// animated icons" is just picking that extension instead.
	const animated = String(guild.icon).startsWith("a_")
	const ext = animated && !staticIcons() ? "gif" : "png"
	return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=64`
}

export default function GuildIcon({ guild, size = SIZE, radius }: { guild: any; size?: number; radius?: number }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Image, Text, View } = ReactNative

	const url = iconUrl(guild)
	const rad = radius ?? size / 2

	if (url) {
		return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: rad }} />
	}

	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: rad,
				backgroundColor: avatarFallback(),
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Text style={{ color: "#FFFFFF", fontSize: Math.max(10, size * 0.33), fontWeight: "600" }}>
				{acronym(guild?.name)}
			</Text>
		</View>
	)
}
