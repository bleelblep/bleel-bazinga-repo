import * as modulesSettings from "@valenced/discord/modules/settings";
import { CONVERSATION_ROUTE } from "./components/conversation";
import Backup from "./pages/Backup";
import Conversation from "./pages/Conversation";
import Debug from "./pages/Debug";
import Edits from "./pages/Edits";
import License from "./pages/License";
import Log from "./pages/Log";
import Media from "./pages/Media";
import Options from "./pages/Options";
import Visuals from "./pages/Visuals";

const DEBUG: boolean = false;

const PREFIX = "bleelblep.ghost-log-ng";

export const LOG_ROUTE = `${PREFIX}.log`;
export const EDITS_ROUTE = `${PREFIX}.edits`;
export const MEDIA_ROUTE = `${PREFIX}.media`;
export const OPTIONS_ROUTE = `${PREFIX}.options`;
export const VISUALS_ROUTE = `${PREFIX}.visuals`;
export const BACKUP_ROUTE = `${PREFIX}.backup`;
export const LICENSE_ROUTE = `${PREFIX}.license`;
export const DEBUG_ROUTE = `${PREFIX}.debug`;

function refreshSettingsUI() {
	const settings = modulesSettings as any;
	if (typeof settings.refreshSettings === "function") {
		settings.refreshSettings();
		return;
	}
	settings.refreshSettingsNavigator?.();
	settings.refreshSettingsOverviewScreen?.();
}

export function registerPages(): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = modulesSettings;

	// Registered inside `onSettingsModulesLoaded`: it fires immediately when Discord's
	// settings modules are already loaded, and waits when they are not. Registering
	// before they exist is how a page ends up missing until the app is restarted.
	let unregister: Array<() => void> = [];
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			registerSettingsItem(LOG_ROUTE, {
				parent: null,
				type: "route",
				useTitle: () => "Deleted messages",
				screen: { route: LOG_ROUTE, getComponent: () => Log },
			}),
			registerSettingsItem(EDITS_ROUTE, {
				parent: null,
				type: "route",
				useTitle: () => "Edited messages",
				screen: { route: EDITS_ROUTE, getComponent: () => Edits },
			}),
			// One channel or DM from either log; opened with { channelId, kind } params.
			registerSettingsItem(CONVERSATION_ROUTE, {
				parent: null,
				type: "route",
				useTitle: () => "Conversation",
				screen: { route: CONVERSATION_ROUTE, getComponent: () => Conversation },
			}),
			registerSettingsItem(MEDIA_ROUTE, {
				parent: null,
				type: "route",
				useTitle: () => "Deleted media",
				screen: { route: MEDIA_ROUTE, getComponent: () => Media },
			}),
			registerSettingsItem(OPTIONS_ROUTE, {
				parent: null,
				type: "route",
				useTitle: () => "Logging",
				screen: { route: OPTIONS_ROUTE, getComponent: () => Options },
			}),
			registerSettingsItem(VISUALS_ROUTE, {
				parent: null,
				type: "route",
				useTitle: () => "Visual style",
				screen: { route: VISUALS_ROUTE, getComponent: () => Visuals },
			}),
			registerSettingsItem(BACKUP_ROUTE, {
				parent: null,
				type: "route",
				useTitle: () => "Backup & encryption",
				screen: { route: BACKUP_ROUTE, getComponent: () => Backup },
			}),
			registerSettingsItem(LICENSE_ROUTE, {
				parent: null,
				type: "route",
				useTitle: () => "Licence",
				screen: { route: LICENSE_ROUTE, getComponent: () => License },
			}),
			...(DEBUG
				? [
						registerSettingsItem(DEBUG_ROUTE, {
							parent: null,
							type: "route",
							useTitle: () => "Debug",
							screen: { route: DEBUG_ROUTE, getComponent: () => Debug },
						}),
					]
				: []),
		];

		refreshSettingsUI();
	});

	return () => {
		unsubscribe();
		for (const remove of unregister) remove();
		unregister = [];
		refreshSettingsUI();
	};
}
