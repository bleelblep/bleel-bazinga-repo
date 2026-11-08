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
	/** Also keep the history of your own edits. Separate from countOwnMessages (Options > Include my own deleted messages). */
	logOwnEdits: boolean;
	/** Show those earlier versions above the message in chat. */
	showEditHistory: boolean;
	/** The main page's message-logger warning was hidden for good (after a confirm). */
	warningDismissed: boolean;
	/** Catch notices are Ghost Log's own, tappable to open the message, shown for 6 seconds. */
	tapToJump: boolean;
	/** Adds "Remove from Ghost Log" to chat's long-press menu on logged messages. */
	removeFromChat: boolean;
}
