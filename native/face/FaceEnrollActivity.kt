package com.chaman.nap

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.android.gms.tasks.Tasks
import java.util.concurrent.Executors

/**
 * Enrolment screen (the only place with a camera preview). Add 6+ live samples: straight, slight angles,
 * with and without glasses. Only embeddings are stored, never photos.
 */
class FaceEnrollActivity : ComponentActivity() {
    private lateinit var store: FaceStore
    private lateinit var info: TextView
    private lateinit var previewView: PreviewView
    private var camera: CameraHelper? = null
    private val detector = FaceDetect.createDetector()
    private val worker = Executors.newSingleThreadExecutor()
    @Volatile private var lastFrame: Bitmap? = null
    @Volatile private var engine: FaceEngine? = null

    private val askCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) startCamera() else info.text = "Camera permission chahiye"
    }
    private val pickImages = registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        if (uris.isNotEmpty()) addFromGallery(uris)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = FaceStore(this)
        val dp = resources.displayMetrics.density
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        previewView = PreviewView(this)
        root.addView(previewView, LinearLayout.LayoutParams(-1, 0, 1f))
        info = TextView(this).apply {
            textSize = 15f
            setPadding((12 * dp).toInt(), (12 * dp).toInt(), (12 * dp).toInt(), (12 * dp).toInt())
        }
        root.addView(info, LinearLayout.LayoutParams(-1, -2))
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        val cap = Button(this).apply { text = "Capture live"; setOnClickListener { captureLive() } }
        val gal = Button(this).apply { text = "Gallery se"; setOnClickListener { pickImages.launch("image/*") } }
        val done = Button(this).apply { text = "Ho gaya"; setOnClickListener { finish() } }
        row.addView(cap, LinearLayout.LayoutParams(0, -2, 1f))
        row.addView(gal, LinearLayout.LayoutParams(0, -2, 1f))
        row.addView(done, LinearLayout.LayoutParams(0, -2, 1f))
        root.addView(row, LinearLayout.LayoutParams(-1, -2))
        setContentView(root)
        updateInfo()
        // load the models off the main thread
        worker.execute { engine = FaceEngine.get(applicationContext); runOnUiThread { updateInfo() } }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startCamera()
        else askCamera.launch(Manifest.permission.CAMERA)
    }

    private fun startCamera() {
        camera = CameraHelper(this, previewView) { lastFrame = it }.also { it.start() }
    }

    private fun updateInfo() {
        val s = store.load()
        val live = s.count { it.source == "live" }
        val m = if (engine == null) " (model load ho raha hai...)" else ""
        info.text = "Samples: ${s.size} (live $live, gallery ${s.size - live}). 6+ live samples lo: seedha, thoda side, chashme ke saath aur bina.$m"
    }

    private fun captureLive() {
        val frame = lastFrame ?: return toast("Camera abhi ready nahi")
        worker.execute {
            val msg = enrol(frame, "live")
            runOnUiThread { toast(msg ?: "Face add ho gaya"); updateInfo() }
        }
    }

    private fun addFromGallery(uris: List<Uri>) {
        worker.execute {
            var added = 0
            for (uri in uris) {
                val bmp = FaceDetect.loadFromUri(this, uri) ?: continue
                if (enrol(bmp, "gallery") == null) added++
            }
            runOnUiThread { toast("$added / ${uris.size} photo add hui"); updateInfo() }
        }
    }

    /** Returns null on success, otherwise the reason. Runs off the main thread. */
    private fun enrol(bmp: Bitmap, source: String): String? {
        return try {
            val eng = engine ?: FaceEngine.get(applicationContext).also { engine = it }
            if (eng.models.isEmpty()) return "Face model app me nahi hai"
            val faces = Tasks.await(detector.process(FaceDetect.inputImage(bmp)))
            val face = FaceDetect.largest(faces) ?: return "Face nahi dikha, dobara try karo"
            if (face.boundingBox.width() < 90) return "Face chhota hai, camera ke paas aao"
            if (!FaceDetect.isFrontal(face)) return "Face seedha nahi hai, camera ki taraf dekho"
            val aligned = FaceDetect.align(bmp, face) ?: return "Aankh/muh saaf nahi dikhe, roshni badhao"
            store.add(FaceStore.Sample(source, System.currentTimeMillis(), eng.embedAll(aligned)))
            null
        } catch (e: Exception) {
            "Face nahi dikha, dobara try karo"
        }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()

    override fun onDestroy() {
        super.onDestroy()
        camera?.stop()
        detector.close()
        worker.shutdown()
    }
}
