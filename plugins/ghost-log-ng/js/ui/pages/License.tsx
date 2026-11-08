import * as components from "@valenced/components";
import { Design } from "@valenced/discord/design";
import * as ReactNative from "react-native";
import { useBottomPadding } from "../safeArea";

/** Attribution, on its own route so the root page stays an index. Plain navigator route. */
export default function License() {
	const { Page } = components;
	const { ScrollView } = ReactNative;
	const { Stack, TableRowGroup, TableRow } = Design;

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Licence">
						<TableRow
							label="Ghost Log Native Beta"
							subLabel="CC0-1.0 — public domain."
						/>
						<TableRow
							label="Visual indicator technique"
							subLabel="Adapted from redstonekasi's message-logger (BSD-3-Clause). See this plugin's NOTICE.md."
						/>
						<TableRow
							label="Delete interception & storage"
							subLabel="Based on bleelblep's Ghost Log / Anti Ghost Ping (CC0-1.0)."
						/>
						<TableRow
							label="Native plugin framework"
							subLabel="Built on the Valenced plugin template (GPL-3.0)."
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	);
}
