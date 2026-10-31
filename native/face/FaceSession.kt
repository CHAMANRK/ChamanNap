package com.chaman.nap

import android.content.Context
import android.graphics.Bitmap
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.getcapacitor.JSObject
import com.google.android.gms.tasks.Tasks
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Headless face check. No preview: only a camera stream is analysed, the status line shows what to do ("Blink karo").
 * Steps: face found -> (optional) blink open/closed/open -> 5 frames must match the enrolled face on average.
 * Result: owner | unknown | noface | noblink | unclear | error.
 * "unknown" means a face WAS clearly seen for many frames and none of them matched. No face / unclear never counts as unknown.
 */
class FaceSession(
    private val ctx: Context,
    private val owner: LifecycleOwner,
    private val job: FaceBus.Job,
    private val onHostFail: (String) -> Unit,
    private val onEnd: () -> Unit,
) {
    private companion object {
        const val WINDOW = 5
        const val UNKNOWN_AFTER = 15 // scored frames, none of the 5-frame windows passed
        const val NO_FRAME_MS = 6000L
        const val NO_FACE_MS = 10000L
        const val BLINK_MS = 15000L
        const val DEADLINE_MS = 30000L
    }

    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private val ended = AtomicBoolean(false)
    private val detector = FaceDetect.createDetector()
    private val t0 = SystemClock.elapsedRealtime()

    @Volatile private var frames = 0
    @Volatile private var lastFaceAt = t0
    @Volatile private var blinkStartAt = 0L

    private enum class Blink { WAIT_OPEN, WAIT_CLOSED, WAIT_REOPEN, DONE }
    private var blink = if (job.opts.blink) Blink.WAIT_OPEN else Blink.DONE
    private val recent = ArrayDeque<Float>()
    private var scored = 0
    private var lastScore = 0f
    private var threshold = 0.5f
    private var lastFaceFrame: Bitmap? = null
    private var samples: List<FaceStore.Sample> = emptyList()
    private var spec: ModelSpec? = null

    fun start() {
        FaceBus.progress("Face check: camera dekh raha hu", "run")
        executor.execute {
            try {
                val engine = FaceEngine.get(ctx)
                if (engine.models.isEmpty()) {
                    finishError("NO_MODEL", "Face model app me nahi mila")
                    return@execute
                }
                spec = engine.activeModel("auto")
                threshold = spec!!.threshold + job.opts.strictness
                samples = FaceStore(ctx).load()
                if (samples.isEmpty()) {
                    finishError("NOT_ENROLLED", "Koi face enroll nahi hai")
                    return@execute
                }
            } catch (e: Exception) {
                finishError("MODEL", "Model load nahi hua: " + (e.message ?: ""))
                return@execute
            }
            handler.post { bindCamera() }
        }
        handler.postDelayed(object : Runnable {
            override fun run() {
                if (ended.get()) return
                val now = SystemClock.elapsedRealtime()
                when {
                    frames == 0 && now - t0 > NO_FRAME_MS -> {
                        if (ended.compareAndSet(false, true)) {
                            hostFailed("koi frame nahi aaya")
                        }
                        return
                    }
                    now - t0 > DEADLINE_MS -> {
                        decideOnTimeout()
                        return
                    }
                    frames > 0 && now - lastFaceAt > NO_FACE_MS -> {
                        finish("noface", null)
                        return
                    }
                    blink != Blink.DONE && blinkStartAt > 0 && now - blinkStartAt > BLINK_MS -> {
                        finish("noblink", null)
                        return
                    }
                }
                handler.postDelayed(this, 400)
            }
        }, 400)
    }

    private fun bindCamera() {
        val future = ProcessCameraProvider.getInstance(ctx)
        future.addListener({
            try {
                val provider = future.get()
                val analysis = ImageAnalysis.Builder()
                    .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analysis.setAnalyzer(executor) { proxy -> handle(proxy) }
                provider.unbindAll()
                provider.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, analysis)
            } catch (e: Exception) {
                if (ended.compareAndSet(false, true)) {
                    hostFailed("camera bind: " + (e.message ?: e.javaClass.simpleName))
                }
            }
        }, ContextCompat.getMainExecutor(ctx))
    }

    private fun handle(proxy: ImageProxy) {
        try {
            if (ended.get()) return
            val upright = FaceDetect.rotate(proxy.toBitmap(), proxy.imageInfo.rotationDegrees)
            frames++
            analyse(upright)
        } catch (_: Exception) {
        } finally {
            proxy.close()
        }
    }

    // Runs on the analysis thread, one frame at a time.
    private fun analyse(frame: Bitmap) {
        val now = SystemClock.elapsedRealtime()
        val faces = try {
            Tasks.await(detector.process(FaceDetect.inputImage(frame)))
        } catch (e: Exception) {
            return
        }
        val face = FaceDetect.largest(faces)
        if (face == null) {
            recent.clear()
            FaceBus.progress("Camera ke saamne aao", "wait")
            return
        }
        lastFaceAt = now
        lastFaceFrame = frame
        if (face.boundingBox.width() < 90 || !FaceDetect.isFrontal(face, 25f, 25f)) {
            recent.clear()
            FaceBus.progress("Seedha camera ki taraf dekho", "wait")
            return
        }
        if (blinkStartAt == 0L) blinkStartAt = now

        if (blink != Blink.DONE) {
            val l = face.leftEyeOpenProbability
            val r = face.rightEyeOpenProbability
            if (l != null && r != null) {
                val open = l > 0.6f && r > 0.6f
                val closed = l < 0.3f && r < 0.3f
                when (blink) {
                    Blink.WAIT_OPEN -> if (open) blink = Blink.WAIT_CLOSED
                    Blink.WAIT_CLOSED -> if (closed) blink = Blink.WAIT_REOPEN
                    Blink.WAIT_REOPEN -> if (open) blink = Blink.DONE
                    Blink.DONE -> {}
                }
            }
            if (blink != Blink.DONE) {
                FaceBus.progress("Blink karo (ek baar)", "wait")
                return
            }
        }

        val aligned = FaceDetect.align(frame, face)
        if (aligned == null) {
            recent.clear()
            FaceBus.progress("Roshni me camera ki taraf dekho", "wait")
            return
        }
        val s = spec ?: return
        val probe = try {
            FaceEngine.get(ctx).embedder(s.id).embed(aligned)
        } catch (e: Exception) {
            return
        }
        val score = Matcher.score(samples, s.id, probe) ?: return
        lastScore = score
        scored++
        recent.addLast(score)
        if (recent.size > WINDOW) recent.removeFirst()
        FaceBus.progress("Face match " + minOf(recent.size, WINDOW) + "/" + WINDOW, "run")
        if (recent.size == WINDOW) {
            val avg = recent.average().toFloat()
            val worst = recent.minOrNull() ?: 0f
            if (avg >= threshold && worst >= threshold - 0.10f) {
                finish("owner", avg)
                return
            }
        }
        if (scored >= UNKNOWN_AFTER) finish("unknown", recent.average().toFloat())
    }

    private fun decideOnTimeout() {
        when {
            scored >= 8 -> finish("unknown", lastScore)
            blink != Blink.DONE && blinkStartAt > 0 -> finish("noblink", null)
            frames > 0 && SystemClock.elapsedRealtime() - lastFaceAt > 3000 -> finish("noface", null)
            else -> finish("unclear", null)
        }
    }

    private fun hostFailed(why: String) {
        handler.removeCallbacksAndMessages(null)
        stopCamera()
        executor.execute {
            try { detector.close() } catch (_: Exception) {}
            executor.shutdown()
        }
        onHostFail(why)
    }

    private fun finishError(code: String, msg: String) {
        if (!ended.compareAndSet(false, true)) return
        handler.removeCallbacksAndMessages(null)
        FaceBus.progress(msg, "fail")
        FaceBus.finish(FaceBus.error(code, msg))
        handler.post { shutdown() }
    }

    private fun finish(kind: String, score: Float?) {
        if (!ended.compareAndSet(false, true)) return
        handler.removeCallbacksAndMessages(null)
        executor.execute {
            val res = JSObject().put("result", kind)
            if (score != null) res.put("score", Math.round(score * 100f) / 100f)
            res.put("threshold", Math.round(threshold * 100f) / 100f)
            var locked = false
            var photo = ""
            val o = job.opts
            when (kind) {
                "owner" -> {
                    if (o.grant) FaceGate.grant(o.ttlMin)
                    FaceBus.progress("Face verify ho gaya", "ok")
                }
                "unknown" -> {
                    FaceGate.revoke()
                    FaceConfig.get(ctx).lastUnknownAt = System.currentTimeMillis()
                    FaceBus.progress("Unknown face mila", "fail")
                    if (o.savePhoto) photo = savePhoto()
                    if (o.lockUnknown) locked = lockPhone()
                }
                "noface" -> FaceBus.progress("Face nahi dikha", "fail")
                "noblink" -> FaceBus.progress("Blink nahi hua", "fail")
                else -> FaceBus.progress("Face saaf nahi dikha", "fail")
            }
            res.put("locked", locked)
            res.put("photo", photo)
            FaceBus.finish(res)
            handler.post { shutdown() }
        }
    }

    private fun lockPhone(): Boolean = try {
        val s = ChamanAccessibilityService.get()
        s != null && s.pressKey("lock")
    } catch (e: Exception) {
        false
    }

    private fun savePhoto(): String {
        val bmp = lastFaceFrame ?: return ""
        val name = "intruder-" + SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date()) + ".jpg"
        val dirs = listOf(
            File(Environment.getExternalStorageDirectory(), "Chaman/intruder"),
            File(ctx.getExternalFilesDir(null), "intruder"),
        )
        for (d in dirs) {
            try {
                if (!d.exists() && !d.mkdirs()) continue
                val f = File(d, name)
                FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.JPEG, 85, it) }
                if (f.length() > 0) return f.absolutePath
            } catch (_: Exception) {
            }
        }
        return ""
    }

    private fun stopCamera() {
        try {
            ProcessCameraProvider.getInstance(ctx).get().unbindAll()
        } catch (_: Exception) {
        }
    }

    private fun shutdown() {
        stopCamera()
        executor.execute {
            try { detector.close() } catch (_: Exception) {}
            executor.shutdown()
        }
        onEnd()
    }

    /** Host is going away (service destroyed / activity closed) before a result: stop quietly. */
    fun stop() {
        if (ended.compareAndSet(false, true)) {
            handler.removeCallbacksAndMessages(null)
            FaceBus.finish(FaceBus.error("CANCELLED", "Face check beech me band ho gaya"))
            stopCamera()
            executor.execute {
                try { detector.close() } catch (_: Exception) {}
                executor.shutdown()
            }
        }
    }
}
