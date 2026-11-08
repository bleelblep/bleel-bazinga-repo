/**
 * A coloured context card (settings design guide §4): red for a problem happening now, yellow for a
 * warning. The tint comes from the theme's feedback colour, so it reads on Light as well as Dark
 * (§3.5); the old fixed hex is the fallback.
 *
 * Cards about a current problem have no hide button (§4.3). `children` goes under the body, for an
 * action button.
 */

import { Design } from "@valenced/discord/design";
import * as ReactNative from "react-native";
import { token, withAlpha } from "../theme";

export type StatusTone = "critical" | "warning";

const TONES: Record<StatusTone, { token: string; fallback: string }> = {
	critical: { token: "TEXT_FEEDBACK_CRITICAL", fallback: "#da373c" },
	warning: { token: "TEXT_FEEDBACK_WARNING", fallback: "#f0b232" },
};

export function StatusCard({
	tone,
	title,
	body,
	children,
}: {
	tone: StatusTone;
	title: string;
	body?: string;
	children?: any;
}) {
	const { View } = ReactNative;
	const { Card, Text } = Design as any;
	const spec = TONES[tone] ?? TONES.warning;
	const colour = token(spec.token, spec.fallback);
	return (
		<Card
			variant="secondary"
			border="none"
			style={{
				backgroundColor: withAlpha(colour, "1f", `${spec.fallback}1f`),
				borderColor: withAlpha(colour, "66", `${spec.fallback}66`),
				borderWidth: 1,
			}}
		>
			<View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
				<Text color={`text-feedback-${tone}`} variant="text-md/semibold">
					{title}
				</Text>
				{body ? (
					<Text color="text-muted" variant="text-sm/normal">
						{body}
					</Text>
				) : null}
				{children}
			</View>
		</Card>
	);
}

/**
 * Why nothing may write to the log right now, or undefined when it can be changed. Reads the
 * storage status defensively: `unreadable` (a log that exists but couldn't be read) counts like
 * `locked`, and an older status without it is simply not blocked by it.
 */
export function logBlock(status: unknown): "locked" | "unreadable" | undefined {
	const s = status as { locked?: unknown; unreadable?: unknown } | undefined;
	if (s?.locked) return "locked";
	if (s?.unreadable) return "unreadable";
	return undefined;
}

/** "the log is locked" / "the log couldn't be read", for "Couldn't clear: …" toasts and sub-labels. */
export function blockReason(block: "locked" | "unreadable"): string {
	return block === "locked" ? "the log is locked" : "the log couldn't be read";
}
