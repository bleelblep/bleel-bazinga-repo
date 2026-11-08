import { getShownSong } from '../../../../lib/manager'
import { DEFAULTS, getStorage } from '../../../../lib/state'
import { token } from '../../../theme'

/**
 * Colours come from the user's theme (settings design guide §3.5); the fallbacks are the
 * dark-theme hexes upstream hard-coded. Built per render, never at module scope.
 */
function makeStyles() {
	const text = token('TEXT_DEFAULT', '#dbdee1')
	const muted = token('TEXT_MUTED', '#949ba4')
	const subtle = token('BACKGROUND_MOD_SUBTLE', '#2b2d31')
	const border = token('BORDER_SUBTLE', '#3a3c41')
	const brand = token('BACKGROUND_BRAND', '#5865f2')
	return {
		container: {
			padding: 16,
			alignItems: 'center',
			justifyContent: 'center',
			minHeight: 120,
		},
		loadingContent: {
			alignItems: 'center',
			justifyContent: 'center',
		},
		loadingSpinner: {
			width: 20,
			height: 20,
			borderRadius: 10,
			borderWidth: 2,
			borderColor: brand,
			borderTopColor: 'transparent',
			marginBottom: 8,
		},
		previewContainer: {
			padding: 16,
		},
		header: {
			flexDirection: 'row',
			justifyContent: 'space-between',
			alignItems: 'center',
			marginBottom: 12,
			gap: 8,
		},
		content: {
			flexDirection: 'row',
			alignItems: 'center',
		},
		albumArt: {
			width: 80,
			height: 80,
			backgroundColor: subtle,
			borderRadius: 12,
			justifyContent: 'center',
			alignItems: 'center',
			marginRight: 16,
			borderWidth: 1,
			borderColor: border,
			overflow: 'hidden',
			flexShrink: 0,
		},
		trackInfo: {
			flex: 1,
			minWidth: 0,
		},
		progressContainer: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
			marginTop: 6,
		},
		progressBar: {
			flex: 1,
			height: 2,
			backgroundColor: subtle,
			borderRadius: 3,
			overflow: 'hidden',
		},
		progressFill: {
			height: 2,
			backgroundColor: brand,
			borderRadius: 3,
		},
		loadingText: {
			color: muted,
			fontSize: 14,
			fontWeight: '500',
		},
		centeredText: {
			color: muted,
			fontSize: 14,
			fontWeight: '500',
			textAlign: 'center',
		},
		activityType: {
			color: text,
			fontSize: 14,
			fontWeight: '600',
			flex: 1,
		},
		rpcPreviewText: {
			color: muted,
			fontSize: 12,
			fontStyle: 'italic',
			flexShrink: 0,
		},
		albumImage: {
			width: 80,
			height: 80,
			borderRadius: 12,
		},
		musicIcon: {
			color: muted,
			fontSize: 32,
		},
		trackName: {
			color: text,
			fontSize: 16,
			fontWeight: '700',
			marginBottom: 4,
		},
		artistName: {
			color: muted,
			fontSize: 14,
			fontWeight: '500',
			marginBottom: 4,
		},
		tooltipText: {
			color: muted,
			fontSize: 12,
			fontStyle: 'italic',
			marginBottom: 6,
		},
		timeText: {
			color: muted,
			fontSize: 11,
			fontWeight: '500',
			minWidth: 35,
			textAlign: 'center',
		},
	} as const
}

export default function RPCPreview() {
	// Read per-render, never at module scope (coding rule 1).
	const React = valenced.react.React
	const { View, Text, Image } = valenced.react.ReactNative
	const { Card } = valenced.discord.design.Design as any
	const styles: any = makeStyles()

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }

	const [currentProgress, setCurrentProgress] = React.useState(0)

	// Shown when nothing is on the status yet, so the settings still have something to preview.
	const fallbackTrack = {
		name: 'Bohemian Rhapsody',
		artist: 'Queen',
		album: 'A Night at the Opera',
		image: null,
		nowPlaying: true,
		duration: 354,
		startTime: Math.floor(Date.now() / 1000) - 120,
	}

	// The song and cover actually on your status (lib/manager.ts), so the preview and Discord
	// match. Upstream fetched the last Last.fm scrobble here, which could be another song with
	// another cover. Re-read every few seconds while the page is open; it's a local read.
	const readShown = () => {
		const shown = getShownSong()
		if (!shown) return fallbackTrack
		const t = shown.track
		return {
			name: t.name,
			artist: t.artist,
			album: t.album,
			image: shown.art ?? null,
			nowPlaying: t.nowPlaying,
			duration: t.duration,
			startTime: t.from,
		}
	}
	const [previewTrack, setPreviewTrack] = React.useState<any>(readShown)
	React.useEffect(() => {
		const id = setInterval(() => setPreviewTrack(readShown()), 3000)
		return () => clearInterval(id)
	}, [])
	React.useEffect(() => {
		if (!previewTrack?.nowPlaying || !s.showTimestamp) {
			return
		}

		const interval = setInterval(() => {
			if (previewTrack.startTime && previewTrack.duration) {
				const now = Math.floor(Date.now() / 1000)
				const elapsed = now - previewTrack.startTime
				const progress = Math.min(elapsed / previewTrack.duration, 1)
				setCurrentProgress(progress)
			}
		}, 1000)

		return () => clearInterval(interval)
	}, [previewTrack, s.showTimestamp])

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60)
		const secs = Math.floor(seconds % 60)
		return `${mins}:${secs.toString().padStart(2, '0')}`
	}

	const getPreviewText = () => {
		let text = ''

		if (s.showAlbumInTooltip && previewTrack?.album) {
			text += `on ${previewTrack.album}`
		}

		if (s.showDurationInTooltip && previewTrack?.duration) {
			const durationText = ` • ${formatTime(previewTrack.duration)}`
			if (text) {
				text += durationText
			} else {
				text = formatTime(previewTrack.duration)
			}
		}

		return text || 'No tooltip text'
	}

	const getCurrentProgressData = () => {
		if (!previewTrack?.duration) return { current: 0, total: 0, progress: 0 }

		if (previewTrack.nowPlaying) {
			const current = currentProgress * previewTrack.duration
			return {
				current: current,
				total: previewTrack.duration,
				progress: currentProgress,
			}
		} else {
			return {
				current: previewTrack.duration * 0.3,
				total: previewTrack.duration,
				progress: 0.3,
			}
		}
	}

	// Store getStorage calls with defaults to prevent undefined rendering
	const activityType = s.listeningTo ? 'Listening to' : 'Playing'
	const appName = s.appName || 'Music'
	const showLargeText = s.showLargeText
	const showTimestamp = s.showTimestamp

	if (!previewTrack) {
		return (
			<Card variant="secondary" style={styles.container}>
				<Text style={styles.centeredText}>Couldn't load the preview</Text>
			</Card>
		)
	}

	const progressData = getCurrentProgressData()
	const previewText = getPreviewText()

	return (
		<Card variant="secondary" style={styles.previewContainer}>
			<View style={styles.header}>
				<Text style={styles.activityType}>
					{activityType} {appName}
				</Text>
				<Text style={styles.rpcPreviewText} numberOfLines={1}>
					Preview
				</Text>
			</View>

			<View style={styles.content}>
				<View style={styles.albumArt}>
					{previewTrack.image ? (
						<Image
							source={{ uri: previewTrack.image }}
							style={styles.albumImage}
							resizeMode="cover"
						/>
					) : (
						<Text style={styles.musicIcon}>♪</Text>
					)}
				</View>

				<View style={styles.trackInfo}>
					<Text style={styles.trackName} numberOfLines={1}>
						{previewTrack.name}
					</Text>
					<Text style={styles.artistName} numberOfLines={1}>
						{previewTrack.artist}
					</Text>
					{showLargeText && previewText !== 'No tooltip text' && (
						<Text style={styles.tooltipText} numberOfLines={1}>
							{previewText}
						</Text>
					)}

					{showTimestamp && previewTrack.duration ? (
						<View style={styles.progressContainer}>
							<Text style={styles.timeText}>
								{formatTime(progressData.current)}
							</Text>
							<View style={styles.progressBar}>
								<View
									style={[
										styles.progressFill,
										{ width: `${progressData.progress * 100}%` },
									]}
								/>
							</View>
							<Text style={styles.timeText}>
								{formatTime(progressData.total)}
							</Text>
						</View>
					) : null}
				</View>
			</View>
		</Card>
	)
}
