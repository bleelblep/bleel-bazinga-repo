/**
 * Jumping from the log to a message in chat.
 *
 * The old plugin installed its three module finders at MODULE SCOPE, so the subscriptions (and the
 * captured modules) survived a plugin disable and leaked for the app's lifetime. Here they are
 * installed inside `installJump()`, called from the deferred patch block in start(), and torn down
 * with it. `jumpToDeletedMessage` degrades gracefully if called before a module is found.
 */

import * as filters from "@valenced/modules/finders/filters";
import { reportError } from "../../../../shared/report";
import { safeLookup } from "./finders";

const DEBUG: boolean = false;

const TAG = "[GhostLogNG:navigate]";

let routing: any;
let channelActions: any;
let messageActions: any;

/**
 * Find the routing/action modules, sweep-and-subscribe (`getModules` back-fills once a module
 * loads; a one-shot scan could miss one not yet initialized). Installed in start(), NOT at module
 * scope -- see the header note.
 */
export function installJump(): () => void {
	const { withProps } = filters;
	const unsubs: Array<() => void> = [];
	const lookup = (
		filter: unknown,
		accept: (mod: any) => void,
		label: string,
	) => {
		unsubs.push(
			safeLookup({
				tag: TAG,
				filter,
				install: (mod: any) => {
					accept(mod);
					return true;
				},
			}),
		);
	};

	lookup(withProps("transitionToGuild"), (mod) => (routing = mod), "routing");
	lookup(
		withProps("selectPrivateChannel"),
		(mod) => (channelActions = mod),
		"channelActions",
	);
	lookup(
		withProps("jumpToMessage"),
		(mod) => (messageActions = mod),
		"messageActions",
	);

	return () => {
		for (const unsub of unsubs) {
			try {
				unsub();
			} catch {
				/* already gone */
			}
		}
		routing = undefined;
		channelActions = undefined;
		messageActions = undefined;
	};
}

/**
 * `openUrl` (tried first in the old plugin) resolves and calls cleanly but does nothing visible
 * on-device -- most likely because it hands the `https://discord.com/...` URL to Android's Intent
 * system, and the repackaged APK isn't registered as that domain's App Links handler.
 * `transitionTo` is a pure in-app router push (same module as the confirmed-working
 * `transitionToGuild`), so it never leaves the JS side.
 *
 * Falls back to transitionToGuild/selectPrivateChannel + jumpToMessage if `transitionTo` isn't
 * present on this build. Logs which path actually ran, not just that a function was called.
 */
export function jumpToDeletedMessage(entry: {
	guildId?: string;
	channelId: string;
	id: string;
}): void {
	const path = `/channels/${entry.guildId ?? "@me"}/${entry.channelId}/${entry.id}`;

	if (typeof routing?.transitionTo === "function") {
		try {
			routing.transitionTo(path);
			if (DEBUG)
				console.log(`${TAG} jumpToDeletedMessage: transitionTo(${path})`);
			return;
		} catch (error) {
			reportError(`${TAG} transitionTo failed:`, error);
		}
	}

	try {
		if (entry.guildId) routing?.transitionToGuild?.(entry.guildId);
		else channelActions?.selectPrivateChannel?.(entry.channelId);
	} catch (error) {
		reportError(`${TAG} guild/channel select failed:`, error);
	}

	try {
		messageActions?.jumpToMessage?.({
			channelId: entry.channelId,
			messageId: entry.id,
			flash: true,
			jumpType: "ANIMATED",
		});
		if (DEBUG)
			console.log(
				`${TAG} jumpToDeletedMessage: fallback transitionToGuild/selectPrivateChannel + jumpToMessage for ${path}`,
			);
	} catch (error) {
		reportError(`${TAG} jumpToMessage failed:`, error);
	}
}
