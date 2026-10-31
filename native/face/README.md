# Face lock (FaceLock merged into Chaman)
Kotlin sources of the former standalone FaceLock app, now a Capacitor plugin (`FaceLockPlugin`). `scripts/patch-android.js` copies them
into the generated Android project in CI. Details: HANDOFF.md > Step20.

- Detection/alignment: ML Kit face detection (landmarks + eye-open probabilities for the blink check).
- Recognition: InsightFace `w600k_mbf` (ArcFace MobileFaceNet, 512-d) via ONNX Runtime. Only embeddings are stored (`faces.json` in app storage).
- Model file is NOT in git: `bash scripts/fetch-face-model.sh` puts it in `assets/models/` (CI does this).
- No anti-spoofing. InsightFace pretrained models are for non-commercial / research use only.
