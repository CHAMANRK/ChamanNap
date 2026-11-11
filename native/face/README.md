# Face lock (FaceLock merged into Chaman)
Kotlin sources of the former standalone FaceLock app, now a Capacitor plugin (`FaceLockPlugin`). `scripts/patch-android.js` copies them
into the generated Android project in CI. Details: HANDOFF.md > Step20.

- Detection/alignment: ML Kit face detection (landmarks + eye-open probabilities for the blink check).
- Recognition: InsightFace `w600k_mbf` (ArcFace MobileFaceNet, 512-d) via ONNX Runtime. Only embeddings are stored (`faces.json` in app storage).
- Model file is NOT in git: `bash scripts/fetch-face-model.sh` puts it in `assets/models/` (CI does this).
- No anti-spoofing. InsightFace pretrained models are for non-commercial / research use only.

## Encrypted backup (survives uninstall)
`native/FaceBackup.java` + `native/FaceBackupCrypto.java` (plain Java, copied by `scripts/patch-android.js`).
- Settings > Face lock > Backup: he sets a passphrase once; the faces (embeddings only) are written AES-256-GCM encrypted to `/sdcard/Chaman/backup/face.enc` (key = PBKDF2-HMAC-SHA256, 400k rounds, header authenticated).
- The derived key is also kept in app prefs wrapped by the Android Keystore, so every new enroll refreshes the backup silently (`FaceStore.save` -> `FaceBackup.autoUpdate`).
- After an uninstall the Keystore key is gone: "Backup se faces wapas lao" asks for the passphrase again, restores `faces.json` and re-arms the auto update. A forgotten passphrase cannot be recovered; enroll again.
- Set / restore / delete need the owner verify window when faces are already enrolled (same lock as enroll / clearFaces); on a fresh install restore is free.
- The AI has no tool for this and never sees the passphrase. Needs "All files access" (already used for /sdcard/Chaman) and Android 8+ (PBKDF2WithHmacSHA256).
- JVM tests: `tests/java/com/chaman/nap/FaceBackupTest.java` (run command in its header; Android classes come from `tests/java-stubs`).
