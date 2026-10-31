import { setEditing } from "../../lib/hidden"
import { BAR_WIDTH, ICON_SIZE } from "../layout"
import * as assets from "@valenced/assets"
import * as ReactNative from "react-native"

const BLURPLE = "#5865F2"

/**
 * Takes the Home button's place at the top of the bar in edit mode. Tapping it leaves edit mode,
 * and the stock bar comes back without the servers just hidden.
 */
export default function DoneButton({ onDone }: { onDone?: () => void }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { Pressable, View, Image, Text } = ReactNative
	const { getAssetIdByName } = assets

	const done = () => {
		onDone?.()
		setEditing(false)
	}

	return (
		<Pressable onPress={done} accessibilityRole="button" accessibilityLabel="Done hiding servers">
			<View style={{ width: BAR_WIDTH, alignItems: "center", marginBottom: 10 }}>
				<View
					style={{
						width: ICON_SIZE,
						height: ICON_SIZE,
						borderRadius: ICON_SIZE / 2,
						backgroundColor: BLURPLE,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<Image source={getAssetIdByName("CheckmarkLargeIcon") ?? getAssetIdByName("ic_check")} style={{ width: 24, height: 24, tintColor: "#fff" }} />
				</View>
				<Text style={{ color: BLURPLE, fontSize: 11, fontWeight: "600", marginTop: 4 }}>Done</Text>
			</View>
		</Pressable>
	)
}
