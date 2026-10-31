package com.chaman.nap

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService

/** Camera foreground service: runs one headless face check, then stops itself. */
class FaceVerifyService : LifecycleService() {
    private var session: FaceSession? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        val job = FaceBus.job
        if (job == null || session != null) {
            if (session == null) stopSelf()
            return START_NOT_STICKY
        }
        try {
            goForeground()
        } catch (e: Exception) {
            FaceHost.fallback(applicationContext, "foreground: " + (e.message ?: e.javaClass.simpleName))
            stopSelf()
            return START_NOT_STICKY
        }
        session = FaceSession(
            applicationContext, this, job,
            onHostFail = { why ->
                FaceHost.fallback(applicationContext, why)
                stopSelf()
            },
            onEnd = { stopSelf() },
        ).also { it.start() }
        job.stopper = { Handler(Looper.getMainLooper()).post { session?.stop(); stopSelf() } }
        return START_NOT_STICKY
    }

    private fun goForeground() {
        val ch = "chaman_face"
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(ch) == null) {
            nm.createNotificationChannel(NotificationChannel(ch, "Face check", NotificationManager.IMPORTANCE_LOW))
        }
        val n: Notification = NotificationCompat.Builder(this, ch)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle("Chaman")
            .setContentText("Face check chal raha hai")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(4711, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)
        else startForeground(4711, n)
    }

    override fun onDestroy() {
        session?.stop()
        session = null
        super.onDestroy()
    }
}
