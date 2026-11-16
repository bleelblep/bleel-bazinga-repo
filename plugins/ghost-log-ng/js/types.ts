export type DeleteStyle = "overlay" | "text" | "off";

export interface GhostLogSettings {
	countOwnMessages: boolean;
	logDeletions: boolean;
	toastOnCatch: boolean;
	deleteStyle: DeleteStyle;
	maxEntries: number;
	unlimitedEntries: boolean;
	autoBackupEnabled: boolean;
	backupFilePath: string;
	saveEmbeds: boolean;
	embedsPerFile: 50 | 100;
	lastBackupAt?: number;
	ignoreBots: boolean;
	/** Keep the earlier versions of edited messages in the encrypted edit log. */
	logEdits: boolean;
	/** Also keep the history of your own edits. Written together with countOwnMessages: Logging has one "My own messages" switch for both. */
	logOwnEdits: boolean;
	/** Show those earlier versions above the message in chat. */
	showEditHistory: boolean;
	/** The main page's message-logger warning was hidden for good (after a confirm). */
	warningDismissed: boolean;
	/** Servers nothing is logged from. The name is kept for the list, for a server you have left. */
	ignoredGuilds: IgnoredItem[];
	/** People and bots nothing is logged from, in any server or DM. */
	ignoredUsers: IgnoredItem[];
}

/** One entry of an ignore list: the id that is matched, and a name to show for it. */
export interface IgnoredItem {
	id: string;
	name: string;
	bot?: boolean;
}
