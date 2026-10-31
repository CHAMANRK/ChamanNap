package com.chaman.nap

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

/**
 * Face lock for Chaman. JS side: face.js.
 *  config  - settings from the app (master, minutes, areas, blink, strictness, lock, photo)
 *  status  - model present? faces enrolled? camera allowed? how long the owner stays verified
 *  verify  - headless check (camera service). Poll `progress` meanwhile to show the status text.
 *  enroll  - opens the enroll screen (the only screen with a camera preview)
 *  clearFaces / clearTrust
 * Camera permission: checkPermissions / requestPermissions with alias "camera" (built into Plugin).
 */
@CapacitorPlugin(
    name = "FaceLock",
    permissions = [Permission(strings = [Manifest.permission.CAMERA], alias = "camera")],
)
class FaceLockPlugin : Plugin() {

    private fun cfg() = FaceConfig.get(context)

    private fun cameraOk() =
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    @PluginMethod
    fun config(call: PluginCall) {
        val c = cfg()
        call.getBoolean("master")?.let { c.master = it }
        call.getInt("ttlMin")?.let { c.ttlMin = it }
        call.getBoolean("blink")?.let { c.blink = it }
        call.getFloat("strictness")?.let { c.strictness = it }
        call.getBoolean("lockUnknown")?.let { c.lockUnknown = it }
        call.getBoolean("savePhoto")?.let { c.savePhoto = it }
        val arr: JSArray? = call.getArray("areas")
        if (arr != null) {
            val s = HashSet<String>()
            for (i in 0 until arr.length()) s.add(arr.getString(i))
            c.areas = s
        }
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val c = cfg()
        val models = try { ModelRegistry.load(context).models.size } catch (e: Exception) { 0 }
        val r = JSObject()
        r.put("modelOk", models > 0)
        r.put("enrolled", FaceStore(context).count())
        r.put("camera", cameraOk())
        r.put("master", c.master)
        r.put("active", FaceGate.active(context))
        r.put("remainMs", FaceGate.remainMs())
        r.put("lastUnknownAt", c.lastUnknownAt)
        r.put("a11y", ChamanAccessibilityService.get() != null)
        r.put("busy", FaceBus.job != null)
        call.resolve(r)
    }

    @PluginMethod
    fun progress(call: PluginCall) {
        val j = FaceBus.job
        val r = JSObject()
        r.put("active", j != null)
        r.put("text", j?.text ?: FaceBus.lastText)
        r.put("state", j?.state ?: FaceBus.lastState)
        call.resolve(r)
    }

    @PluginMethod
    fun verify(call: PluginCall) {
        val c = cfg()
        if (!cameraOk()) {
            call.reject("Camera permission chahiye.", "NO_CAMERA")
            return
        }
        val opts = FaceBus.Opts(
            blink = call.getBoolean("blink", c.blink) ?: c.blink,
            lockUnknown = call.getBoolean("lock", c.lockUnknown) ?: c.lockUnknown,
            savePhoto = call.getBoolean("photo", c.savePhoto) ?: c.savePhoto,
            grant = call.getBoolean("grant", true) ?: true,
            ttlMin = c.ttlMin,
            strictness = c.strictness,
        )
        val job = FaceBus.Job(opts) { res -> call.resolve(res) }
        if (!FaceBus.begin(job)) {
            call.reject("Face check pehle se chal raha hai.", "BUSY")
            return
        }
        FaceHost.start(context)
    }

    @PluginMethod
    fun enroll(call: PluginCall) {
        try {
            val i = Intent(context, FaceEnrollActivity::class.java)
            val a = activity
            if (a != null) a.startActivity(i) else context.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            call.resolve(JSObject().put("ok", true))
        } catch (e: Exception) {
            call.reject(e.message ?: "Enroll screen nahi khuli", "ERROR")
        }
    }

    @PluginMethod
    fun clearFaces(call: PluginCall) {
        FaceStore(context).clear()
        FaceGate.revoke()
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun clearTrust(call: PluginCall) {
        FaceGate.revoke()
        call.resolve(JSObject().put("ok", true))
    }
}
