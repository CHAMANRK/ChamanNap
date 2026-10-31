package com.chaman.nap

import android.os.Bundle
import androidx.activity.ComponentActivity

/**
 * Fallback host when Android does not let the background service open the camera.
 * Fully transparent, no preview; it closes itself as soon as the check is over, which returns to the app below.
 */
class FaceVerifyActivity : ComponentActivity() {
    private var session: FaceSession? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val job = FaceBus.job
        if (job == null) {
            finish()
            return
        }
        session = FaceSession(
            applicationContext, this, job,
            onHostFail = { _ ->
                FaceBus.finish(FaceBus.error("CAMERA", "Camera nahi khula"))
                runOnUiThread { finish() }
            },
            onEnd = { runOnUiThread { finish() } },
        ).also { it.start() }
    }

    override fun onDestroy() {
        session?.stop()
        session = null
        super.onDestroy()
    }
}
