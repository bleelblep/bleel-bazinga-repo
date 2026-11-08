/*
 * A text prompt in Discord's own alert style, multi-line or a single hidden line for the recovery
 * password (`secure`).
 * Call from an event handler (row press), never module scope (coding rule 1).
 */

import { AlertActionCreators } from "@valenced/discord/actions";
import { Design } from "@valenced/discord/design";
import { reportError } from "../../../../shared/report";

const TAG = "[GhostLogNG:prompt]";

export interface TextPromptOptions {
	title: string;
	content?: string;
	initialValue?: string;
	placeholder?: string;
	submitText?: string;
	/** One hidden line (a password) instead of multi-line text. */
	secure?: boolean;
	onSubmit(text: string): void;
}

export function showTextPrompt(options: TextPromptOptions): void {
	try {
		const { AlertModal, AlertActionButton, TextInput } = Design as any;
		const alerts = AlertActionCreators as any;
		const key = `glng-prompt-${Date.now()}`;
		let value = options.initialValue ?? "";
		const submit = () => {
			alerts.dismissAlert(key);
			try {
				options.onSubmit(value);
			} catch (error) {
				reportError(`${TAG} onSubmit failed:`, error);
			}
		};
		alerts.openAlert(
			key,
			<AlertModal
				title={options.title}
				content={options.content}
				extraContent={
					<TextInput
						defaultValue={options.initialValue ?? ""}
						placeholder={options.placeholder ?? "Message text"}
						autoFocus
						multiline={!options.secure}
						secureTextEntry={!!options.secure}
						autoCapitalize={options.secure ? "none" : undefined}
						autoCorrect={options.secure ? false : undefined}
						onChange={(text: string) => {
							value = text;
						}}
					/>
				}
				actions={
					<>
						<AlertActionButton
							text={options.submitText ?? "Apply"}
							variant="primary"
							onPress={submit}
						/>
						<AlertActionButton
							text="Cancel"
							variant="secondary"
							onPress={() => alerts.dismissAlert(key)}
						/>
					</>
				}
			/>,
		);
	} catch (error) {
		reportError(`${TAG} could not open prompt:`, error);
	}
}
