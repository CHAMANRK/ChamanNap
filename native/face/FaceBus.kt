package com.chaman.nap

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject

/** One verify job at a time. The plugin creates it, a host (service or transparent activity) runs the camera for it. */
object FaceBus {
    class Opts(
        val blink: Boolean,
        val lockUnknown: Boolean,
        val savePhoto: Boolean,
        val grant: Boolean,
        val ttlMin: Int,
        val strictness: Float,
    )

    class Job(val opts: Opts, val done: (JSObject) -> Unit) {
        @Volatile var text = "Face check shuru"
        @Volatile var state = "run"
        @Volatile var activityTried = false
    }

    @Volatile
    var job: Job? = null

    @Volatile
    var lastText = ""

    @Volatile
    var lastState = "run"

    @Synchronized
    fun begin(j: Job): Boolean {
        if (job != null) return false
        job = j
        return true
    }

    fun progress(text: String, state: String) {
        val j = job ?: return
        j.text = text
        j.state = state
        lastText = text
        lastState = state
    }

    @Synchronized
    fun finish(res: JSObject) {
        val j = job ?: return
        job = null
        j.done(res)
    }

    fun error(code: String, msg: String): JSObject =
        JSObject().put("result", "error").put("code", code).put("message", msg)
}

/** Starts the camera host. First choice is a camera foreground service (nothing on screen). If Android refuses, a transparent activity. */
object FaceHost {
    fun start(ctx: Context) {
        try {
            ContextCompat.startForegroundService(ctx, Intent(ctx, FaceVerifyService::class.java))
        } catch (e: Exception) {
            fallback(ctx, "service: " + (e.message ?: e.javaClass.simpleName))
        }
    }

    fun fallback(ctx: Context, why: String) {
        val j = FaceBus.job ?: return
        if (j.activityTried) {
            FaceBus.finish(FaceBus.error("CAMERA", "Camera nahi khula ($why)"))
            return
        }
        j.activityTried = true
        FaceBus.progress("Face check: camera khol raha hu", "run")
        try {
            ctx.startActivity(Intent(ctx, FaceVerifyActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            FaceBus.finish(FaceBus.error("CAMERA", "Camera nahi khula ($why; " + (e.message ?: "activity") + ")"))
        }
    }
}
