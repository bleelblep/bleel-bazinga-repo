import * as assets from "@valenced/assets"
import * as ReactNative from "react-native"

/** Edit mode's mark on a hidden server or folder: the icon darkened, with a crossed-out eye. */
export default function HiddenMark({ size, radius }: { size: number; radius: number }) {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1.
	const { View, Image } = ReactNative
	const { getAssetIdByName } = assets

	return (
		<View
			pointerEvents="none"
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				width: size,
				height: size,
				borderRadius: radius,
				backgroundColor: "rgba(0, 0, 0, 0.6)",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Image source={getAssetIdByName("EyeSlashIcon") ?? getAssetIdByName("ic_hide")} style={{ width: 22, height: 22, tintColor: "#fff" }} />
		</View>
	)
}
