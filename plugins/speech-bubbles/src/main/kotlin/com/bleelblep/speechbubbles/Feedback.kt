package com.bleelblep.speechbubbles

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.view.View
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/**
 * "Sounds and haptics": a whoosh when you send, a soft two-note pop when a message comes into the
 * open chat, and a tick when you react. JS decides when (it listens to Discord's own events) and
 * calls [play]; this only makes the sound and the vibration.
 *
 * The sounds are our own, made here as short sine sweeps and notes (never Apple's recordings). They
 * play on the notification volume and never with Do Not Disturb on or the phone on silent or vibrate;
 * Do Not Disturb and silent stop the haptics too. The haptics
 * are the phone's own click effect through its vibrator (Discord has the vibrate permission); 0.7.0
 * used the chat list's haptic feedback, which did nothing off screen and on some phones at all.
 * Purely local: no network, no store, nothing sent.
 */
internal class Feedback(private val viewFor: () -> View?) {
	/** Set at start (withAppContext), else taken from the chat list. */
	@Volatile var app: Context? = null
	private val thread = HandlerThread("speech-bubbles-sound").apply { start() }
	private val worker = Handler(thread.looper)
	private val tracks = HashMap<String, AudioTrack>()
	@Volatile var sounds = true
	@Volatile var haptics = true
	/** 0 to 1. */
	@Volatile var volume = 0.6f
	@Volatile private var lastAt = HashMap<String, Long>()
	@Volatile private var played = 0
	@Volatile private var vibrated = 0
	/** Why the last sound or vibration didn't happen, for the settings page. */
	@Volatile private var lastSkip: String? = null
	@Volatile private var lastError: String? = null

	private fun context(): Context? = app ?: viewFor()?.context?.applicationContext?.also { app = it }

	/**
	 * [haptic] false: the sound only (the send animation already ticks when it lands). [test]: from
	 * the settings page's "Try" rows, which play whatever the switches say and wherever you are.
	 */
	fun play(kind: String, haptic: Boolean = true, test: Boolean = false) {
		// A message coming in only makes a sound while the chat is open in front of you.
		if (kind == "receive" && !test) {
			val view = viewFor()
			if (view == null || !view.isAttachedToWindow || !view.hasWindowFocus()) {
				lastSkip = "receive: chat not in front"
				return
			}
		}
		val now = android.os.SystemClock.uptimeMillis()
		// A burst of events (a pasted batch, several reactions at once) makes one sound, not ten.
		val last = lastAt[kind] ?: 0L
		if (now - last < 120) return
		lastAt = HashMap(lastAt).also { it[kind] = now }
		// Do Not Disturb and silent mode mean quiet: no sound and no vibration (the settings page's
		// "Try" rows still play, since you asked for them). Vibrate mode keeps the haptics.
		if (!test) quietReason()?.let { why ->
			lastSkip = why
			if (why != "phone on vibrate") return
			if (haptics && haptic) vibrate(kind)
			return
		}
		if ((haptics || test) && haptic) vibrate(kind)
		if (sounds || test) worker.post { sound(kind) }
	}

	/** Why the phone wants quiet now, or null: Do Not Disturb on, or the ringer on silent or vibrate. */
	private fun quietReason(): String? {
		val ctx = context() ?: return null
		return try {
			val notifications = ctx.getSystemService(android.app.NotificationManager::class.java)
			val filter = notifications?.currentInterruptionFilter ?: android.app.NotificationManager.INTERRUPTION_FILTER_UNKNOWN
			if (filter != android.app.NotificationManager.INTERRUPTION_FILTER_ALL && filter != android.app.NotificationManager.INTERRUPTION_FILTER_UNKNOWN) {
				return "Do Not Disturb is on"
			}
			when (ctx.getSystemService(AudioManager::class.java)?.ringerMode) {
				AudioManager.RINGER_MODE_SILENT -> "phone on silent"
				AudioManager.RINGER_MODE_VIBRATE -> "phone on vibrate"
				else -> null
			}
		} catch (e: Throwable) {
			null
		}
	}

	@Suppress("DEPRECATION")
	private fun vibrate(kind: String) {
		try {
			val ctx = context() ?: run { lastSkip = "haptic: no context"; return }
			val vibrator = if (Build.VERSION.SDK_INT >= 31) {
				ctx.getSystemService(android.os.VibratorManager::class.java)?.defaultVibrator
			} else ctx.getSystemService(android.os.Vibrator::class.java)
			if (vibrator == null || !vibrator.hasVibrator()) {
				lastSkip = "haptic: no vibrator"
				return
			}
			val effect = if (Build.VERSION.SDK_INT >= 29) {
				android.os.VibrationEffect.createPredefined(
					if (kind == "send") android.os.VibrationEffect.EFFECT_HEAVY_CLICK else android.os.VibrationEffect.EFFECT_CLICK,
				)
			} else android.os.VibrationEffect.createOneShot(if (kind == "send") 25L else 15L, android.os.VibrationEffect.DEFAULT_AMPLITUDE)
			vibrator.vibrate(effect)
			vibrated++
		} catch (e: Throwable) {
			lastError = "haptic: ${e.javaClass.simpleName}: ${e.message}"
		}
	}

	private fun sound(kind: String) {
		try {
			val ctx = context() ?: run { lastSkip = "sound: no context"; return }
			val audio = ctx.getSystemService(AudioManager::class.java)
			if (audio != null && audio.ringerMode != AudioManager.RINGER_MODE_NORMAL) {
				lastSkip = "sound: phone on silent or vibrate"
				return
			}
			if (audio != null && audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION) == 0) {
				lastSkip = "sound: notification volume is 0"
				return
			}
			val track = tracks[kind] ?: build(kind)?.also { tracks[kind] = it } ?: return
			if (track.playState == AudioTrack.PLAYSTATE_PLAYING) track.stop()
			track.reloadStaticData()
			track.setVolume(volume.coerceIn(0f, 1f))
			track.play()
			played++
			lastSkip = null
		} catch (e: Throwable) {
			lastError = "sound: ${e.javaClass.simpleName}: ${e.message}"
		}
	}

	private fun build(kind: String): AudioTrack? {
		val samples = when (kind) {
			"send" -> whoosh()
			"receive" -> pop()
			"react" -> tick()
			else -> return null
		}
		val bytes = samples.size * 2
		val track = AudioTrack.Builder()
			.setAudioAttributes(
				AudioAttributes.Builder()
					.setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
					.setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
					.build(),
			)
			.setAudioFormat(
				AudioFormat.Builder()
					.setEncoding(AudioFormat.ENCODING_PCM_16BIT)
					.setSampleRate(RATE)
					.setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
					.build(),
			)
			.setTransferMode(AudioTrack.MODE_STATIC)
			.setBufferSizeInBytes(bytes)
			.build()
		track.write(samples, 0, samples.size)
		return track
	}

	/** Send: a quick rising sweep (about 380 to 1500 Hz) with a soft start and a fast fade. */
	private fun whoosh(): ShortArray {
		val n = (RATE * 0.16).toInt()
		val out = ShortArray(n)
		var phase = 0.0
		for (i in 0 until n) {
			val t = i.toDouble() / n
			val f = 380.0 + (1500.0 - 380.0) * t * t
			phase += 2 * PI * f / RATE
			val env = minOf(1.0, t / 0.12) * (1 - t) * (1 - t)
			out[i] = (sin(phase) * env * 0.55 * Short.MAX_VALUE).toInt().toShort()
		}
		return out
	}

	/** Receive: two short bell-ish notes, a fifth apart (E6 then B6), each dying away. */
	private fun pop(): ShortArray {
		val noteLen = (RATE * 0.085).toInt()
		val gap = (RATE * 0.03).toInt()
		val n = noteLen * 2 + gap
		val out = ShortArray(n)
		fun note(start: Int, f: Double) {
			for (i in 0 until noteLen) {
				val t = i.toDouble() / RATE
				val attack = minOf(1.0, i / (RATE * 0.004))
				val env = attack * exp(-t * 38)
				// A little second harmonic for a rounder, glassier note.
				val v = sin(2 * PI * f * t) * 0.8 + sin(4 * PI * f * t) * 0.2
				val idx = start + i
				out[idx] = (out[idx] + v * env * 0.5 * Short.MAX_VALUE).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
			}
		}
		note(0, 1318.5)
		note(noteLen + gap, 1975.5)
		return out
	}

	/** React: one very short high blip. */
	private fun tick(): ShortArray {
		val n = (RATE * 0.035).toInt()
		val out = ShortArray(n)
		for (i in 0 until n) {
			val t = i.toDouble() / RATE
			val env = minOf(1.0, i / (RATE * 0.002)) * exp(-t * 120)
			out[i] = (sin(2 * PI * 2400 * t) * env * 0.4 * Short.MAX_VALUE).toInt().toShort()
		}
		return out
	}

	fun status(): Map<String, Any?> = mapOf(
		"played" to played,
		"vibrated" to vibrated,
		"skip" to lastSkip,
		"error" to lastError,
		"context" to (app != null),
	)

	fun dispose() {
		worker.post {
			for (t in tracks.values) runCatching { t.release() }
			tracks.clear()
			thread.quitSafely()
		}
	}

	private companion object {
		const val RATE = 44100
	}
}
