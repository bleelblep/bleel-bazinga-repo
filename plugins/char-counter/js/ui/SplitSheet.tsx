/**
 * The split sheet: what a long message will be sent as, and the one button that sends it.
 *
 * Before the send it shows the destination, the count, the wait, every part's text, and what is
 * not carried over (a pending reply, attachments). "Send N messages" starts the operation
 * (`lib/operation.ts`); the sheet then follows it: "Sending part 2 of 4…" with a Stop button, and
 * at the end what happened. Closing the sheet while it runs stops it before the next part.
 *
 * The body sits in a `SheetScrollView` (shared/ui/sheetScroll.tsx): the sheet's own drag gesture
 * only gives way to gorhom's list, so a plain ScrollView inside it could not be scrolled, and
 * `ActionSheet scrollable` alone did not scroll either (both seen on device, 2026-10-31).
 */

import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { useEffect, useRef, useState } from 'react'
import { Dimensions, View } from 'react-native'
import { reportError } from '../../../../shared/report'
import { SheetScrollView } from '../../../../shared/ui/sheetScroll'
import { describeChannel, replyAuthorName } from '../lib/input'
import type { Operation, Progress } from '../lib/operation'
import type { SplitPlan } from '../lib/sender'
import type { DiscordModules } from '@valenced/discord/types'

const SHEET_KEY = 'CharCounterSplit'

interface Props {
	plan: SplitPlan
	/** Starts the operation; undefined when one is already running or the host send is missing. */
	start: () => Operation | undefined
	/** Already running (Send was tapped): the sheet opens on the progress view. */
	operation?: Operation
}

export function openSplitSheet(props: Props) {
	try {
		ActionSheetActionCreators.openLazy(Promise.resolve({ default: SplitSheet }), SHEET_KEY, props as any)
	} catch (error) {
		reportError('[CharCounter] could not open the split sheet:', error)
	}
}

function hide() {
	try {
		ActionSheetActionCreators.hideActionSheet(SHEET_KEY)
	} catch {
		/* already closed */
	}
}

/** 4000 -> "4,000". Hermes' toLocaleString doesn't always group, so done by hand. */
function grouped(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

type UploadStore = DiscordModules.Flux.Store<{ getUploads?(channelId: string, draftType: number): unknown[] }>

/** What the parts carry and leave behind, said up front so nothing is dropped silently. */
function notes(plan: SplitPlan): string[] {
	const notes: string[] = []
	if (plan.reply) notes.push(`Part 1 is your reply to ${replyAuthorName(plan.reply)}${plan.reply.shouldMention === false ? ', without pinging them' : ''}. The rest follow as plain messages.`)
	const { channelId } = plan
	try {
		const uploads = (Stores.UploadAttachmentStore as UploadStore)?.getUploads?.(channelId, 0)
		if (Array.isArray(uploads) && uploads.length > 0) notes.push(`${uploads.length === 1 ? 'The attachment stays' : `The ${uploads.length} attachments stay`} in the message box: send them on their own.`)
	} catch {
		/* no store, no note */
	}
	return notes
}

function SplitSheet({ plan, start, operation: initial }: Props) {
	const { ActionSheet, BottomSheetTitleHeader, Button, Text, Stack, Card } = Design as any
	const [operation, setOperation] = useState<Operation | undefined>(initial)
	const [progress, setProgress] = useState<Progress | undefined>()
	const [refused, setRefused] = useState(false)
	const running = useRef<Operation | undefined>(undefined)
	const n = plan.parts.length
	const noteLines = notes(plan)
	const waitSeconds = Math.round(plan.delayMs / 100) / 10

	useEffect(() => {
		if (!operation) return
		running.current = operation
		setProgress(operation.progress())
		const stop = operation.onChange(setProgress)
		return () => {
			stop()
			// The sheet went away (swipe, back, navigation) while sending: stop before the next part.
			if (!running.current?.progress().outcome) running.current?.cancel('sheet closed')
		}
	}, [operation])

	const onSend = () => {
		const op = start()
		if (!op) {
			setRefused(true)
			return
		}
		setOperation(op)
	}

	const ended = progress?.outcome
	const title = ended ? (ended === 'sent' ? `Sent ${n} messages` : 'Stopped') : operation ? `Sending ${progress?.sending ? `part ${progress.sending} of ${n}` : `${progress?.sent ?? 0} of ${n} sent`}…` : `Send as ${n} messages?`

	return (
		<ActionSheet startExpanded>
			<BottomSheetTitleHeader title={title} />
			<SheetScrollView
				style={{ maxHeight: Math.round(Dimensions.get('window').height * 0.7) }}
				contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
				keyboardShouldPersistTaps="handled"
			>
				<Stack spacing={12}>
					{!operation ? (
						<Card>
							<Text variant="text-md/normal">{`To ${describeChannel(plan.channelId)}, one after another, ${waitSeconds > 0 ? `${waitSeconds} s apart` : 'as fast as Discord confirms each'}. Each part waits for Discord to confirm the one before. Nothing is sent until you tap the button.`}</Text>
							{noteLines.map(note => (
								<Text key={note} variant="text-sm/normal" color="text-warning" style={{ marginTop: 8 }}>
									{note}
								</Text>
							))}
						</Card>
					) : null}

					{operation && !ended ? (
						<Card>
							<Text variant="text-md/normal">{`${progress?.sent ?? 0} of ${n} confirmed. Stop keeps the rest in the message box.`}</Text>
						</Card>
					) : null}

					{ended ? (
						<Card>
							<Text variant="text-md/normal">
								{ended === 'sent'
									? 'Every part was confirmed by Discord.'
									: `${progress?.sent ?? 0} of ${n} were confirmed. ${
											ended === 'rejected' ? `Discord refused part ${progress?.stoppedAt}` : ended === 'uncertain' ? `Part ${progress?.stoppedAt} wasn't confirmed` : `Stopped before part ${progress?.stoppedAt}`
										}${progress?.reason ? ` (${progress.reason})` : ''}. The parts not sent go back in the message box.`}
							</Text>
						</Card>
					) : null}

					{refused ? (
						<Card>
							<Text variant="text-md/normal" color="text-danger">
								Another split is still sending, or Discord's send isn't available. Nothing was sent.
							</Text>
						</Card>
					) : null}

					<View>
						<Stack spacing={8}>
							{plan.parts.map((part, i) => {
								const state = progress ? (i < progress.sent ? 'sent' : progress.sending === i + 1 ? 'sending' : ended ? 'not sent' : '') : ''
								return (
									<Card key={`${i}-${part.length}`}>
										<Text variant="text-sm/semibold" color="text-muted">{`Part ${i + 1} of ${n} · ${grouped(part.length)} characters${state ? ` · ${state}` : ''}`}</Text>
										<Text variant="text-sm/normal" style={{ marginTop: 4 }}>
											{part}
										</Text>
									</Card>
								)
							})}
						</Stack>
					</View>

					{!operation ? (
						<>
							<Button text={`Send ${n} messages`} variant="primary" onPress={onSend} />
							<Button text="Cancel" variant="secondary" onPress={hide} />
						</>
					) : ended ? (
						<Button text="Done" variant="secondary" onPress={hide} />
					) : (
						<Button text="Stop" variant="destructive" onPress={() => operation.cancel('stopped')} />
					)}
				</Stack>
			</SheetScrollView>
		</ActionSheet>
	)
}
