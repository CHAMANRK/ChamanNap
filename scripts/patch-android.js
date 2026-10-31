// Runs in CI after `npx cap add android`: adds the native plugins + accessibility service, registers them, adds permissions.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pkgDir = path.join(root, 'android/app/src/main/java/com/chaman/nap');
const resDir = path.join(root, 'android/app/src/main/res');
fs.mkdirSync(pkgDir, { recursive: true });

for (const f of ['PhoneControlPlugin.java', 'ScreenControlPlugin.java', 'ChamanAccessibilityService.java', 'TermuxPlugin.java', 'TermuxResultReceiver.java', 'FilesPlugin.java', 'IntentsPlugin.java']) {
  fs.copyFileSync(path.join(root, 'native', f), path.join(pkgDir, f));
}

fs.mkdirSync(path.join(resDir, 'xml'), { recursive: true });
fs.copyFileSync(path.join(root, 'native/res/xml/chaman_a11y_config.xml'), path.join(resDir, 'xml/chaman_a11y_config.xml'));
fs.mkdirSync(path.join(resDir, 'values'), { recursive: true });
fs.writeFileSync(
  path.join(resDir, 'values/chaman_a11y.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="chaman_a11y_desc">Chaman ko screen padhne aur tap/type karne deta hai, taaki wo tumhare kehne par phone ke kaam kar sake.</string>
</resources>
`
);

fs.writeFileSync(
  path.join(pkgDir, 'MainActivity.java'),
  `package com.chaman.nap;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhoneControlPlugin.class);
        registerPlugin(ScreenControlPlugin.class);
        registerPlugin(TermuxPlugin.class);
        registerPlugin(FilesPlugin.class);
        registerPlugin(IntentsPlugin.class);
        registerPlugin(FaceLockPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`
);

const mp = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let m = fs.readFileSync(mp, 'utf8');
if (!m.includes('<application')) throw new Error('<application> tag not found in manifest');
if (!m.includes('android.permission.READ_SMS')) {
  const add = `    <uses-permission android:name="android.permission.READ_SMS" />
    <uses-permission android:name="android.permission.SEND_SMS" />
    <uses-permission android:name="android.permission.READ_CONTACTS" />
    <uses-permission android:name="android.permission.CALL_PHONE" />
    <uses-permission android:name="android.permission.WRITE_SETTINGS" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission android:name="com.termux.permission.RUN_COMMAND" />
    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
    <uses-permission android:name="com.android.alarm.permission.SET_ALARM" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />
    <uses-feature android:name="android.hardware.telephony" android:required="false" />
    <queries>
        <package android:name="com.termux" />
        <intent>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent>
    </queries>
`;
  m = m.replace('<application', add + '    <application');
}
if (!m.includes('ChamanAccessibilityService')) {
  const svc = `        <service
            android:name="com.chaman.nap.ChamanAccessibilityService"
            android:exported="true"
            android:label="Chaman"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/chaman_a11y_config" />
        </service>
    `;
  if (!m.includes('</application>')) throw new Error('</application> tag not found in manifest');
  m = m.replace('</application>', svc + '</application>');
}
if (!m.includes('TermuxResultReceiver')) {
  m = m.replace('</application>', '        <receiver android:name="com.chaman.nap.TermuxResultReceiver" android:exported="false" />\n    </application>');
}
if (!m.includes('FaceVerifyService')) {
  // Face lock (merged FaceLock): camera + camera foreground service + 2 activities
  if (!m.includes('android.permission.CAMERA')) {
    m = m.replace('<application', `    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_CAMERA" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-feature android:name="android.hardware.camera.front" android:required="false" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <application`);
  }
  if (!m.includes('</application>')) throw new Error('</application> tag not found in manifest');
  m = m.replace('</application>', `        <service android:name="com.chaman.nap.FaceVerifyService" android:exported="false" android:foregroundServiceType="camera" />
        <activity android:name="com.chaman.nap.FaceVerifyActivity" android:exported="false" android:theme="@android:style/Theme.Translucent.NoTitleBar" android:excludeFromRecents="true" android:noHistory="true" android:taskAffinity="" android:launchMode="singleTask" />
        <activity android:name="com.chaman.nap.FaceEnrollActivity" android:exported="false" android:theme="@android:style/Theme.DeviceDefault.NoActionBar" />
    </application>`);
}
fs.writeFileSync(mp, m);

// ---- Face lock (FaceLock merged into Chaman): Kotlin files, model + models.json assets, Gradle (Kotlin plugin, CameraX, ML Kit, ONNX Runtime) ----
(function patchFace() {
  const faceSrc = path.join(root, 'native/face');
  const kotlinDst = pkgDir;
  for (const f of fs.readdirSync(faceSrc).filter((x) => x.endsWith('.kt'))) fs.copyFileSync(path.join(faceSrc, f), path.join(kotlinDst, f));

  const assetsDst = path.join(root, 'android/app/src/main/assets');
  fs.mkdirSync(path.join(assetsDst, 'models'), { recursive: true });
  fs.copyFileSync(path.join(faceSrc, 'assets/models.json'), path.join(assetsDst, 'models.json'));
  const mdir = path.join(faceSrc, 'assets/models');
  let haveModel = false;
  if (fs.existsSync(mdir)) {
    for (const f of fs.readdirSync(mdir).filter((x) => x.endsWith('.onnx'))) {
      fs.copyFileSync(path.join(mdir, f), path.join(assetsDst, 'models', f));
      haveModel = true;
    }
  }
  if (!haveModel) console.log('WARNING: face model (.onnx) not found in native/face/assets/models. Run scripts/fetch-face-model.sh. Face lock will say "model nahi".');

  // minSdk 26 (ONNX Runtime / FaceLock need it)
  const vp = path.join(root, 'android/variables.gradle');
  if (fs.existsSync(vp)) {
    let v = fs.readFileSync(vp, 'utf8');
    v = v.replace(/minSdkVersion\s*=\s*(\d+)/, (all, n) => (+n < 26 ? 'minSdkVersion = 26' : all));
    fs.writeFileSync(vp, v);
  }

  // root build.gradle: Kotlin Gradle plugin on the classpath
  const rp = path.join(root, 'android/build.gradle');
  let r = fs.readFileSync(rp, 'utf8');
  if (!r.includes('kotlin-gradle-plugin')) {
    const re = /(classpath\s+['"]com\.android\.tools\.build:gradle:[^'"]+['"])/;
    if (!re.test(r)) throw new Error('android/build.gradle: AGP classpath line not found');
    r = r.replace(re, "$1\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25'");
    fs.writeFileSync(rp, r);
  }

  // app build.gradle: kotlin-android plugin, arm64 only, kotlin jvmTarget = Java target, dependencies
  const ap = path.join(root, 'android/app/build.gradle');
  let g = fs.readFileSync(ap, 'utf8');
  if (!g.includes('chaman-face')) {
    if (!/apply plugin:\s*['"]com\.android\.application['"]/.test(g)) throw new Error('app/build.gradle: application plugin line not found');
    g = g.replace(/apply plugin:\s*['"]com\.android\.application['"]/, "$&\napply plugin: 'kotlin-android' // chaman-face");
    let jt = '21';
    try {
      const cb = fs.readFileSync(path.join(root, 'android/app/capacitor.build.gradle'), 'utf8');
      const mm = cb.match(/JavaVersion\.VERSION_(\d+)/);
      if (mm) jt = mm[1];
    } catch (e) { /* capacitor.build.gradle not there yet: keep 21 */ }
    if (!/defaultConfig\s*\{/.test(g)) throw new Error('app/build.gradle: defaultConfig not found');
    g = g.replace(/defaultConfig\s*\{/, "defaultConfig {\n        ndk { abiFilters 'arm64-v8a' } // chaman-face");
    if (!/\nandroid\s*\{/.test(g)) throw new Error('app/build.gradle: android block not found');
    g = g.replace(/\nandroid\s*\{/, "\nandroid {\n    kotlinOptions { jvmTarget = '" + jt + "' } // chaman-face");
    if (!/\ndependencies\s*\{/.test(g)) throw new Error('app/build.gradle: dependencies block not found');
    g = g.replace(/\ndependencies\s*\{/, `
dependencies {
    // chaman-face
    implementation 'androidx.camera:camera-core:1.3.4'
    implementation 'androidx.camera:camera-camera2:1.3.4'
    implementation 'androidx.camera:camera-lifecycle:1.3.4'
    implementation 'androidx.camera:camera-view:1.3.4'
    implementation 'androidx.lifecycle:lifecycle-service:2.8.7'
    implementation 'androidx.exifinterface:exifinterface:1.3.7'
    implementation 'com.google.mlkit:face-detection:16.1.6'
    implementation 'com.google.android.gms:play-services-tasks:18.2.0'
    implementation 'com.microsoft.onnxruntime:onnxruntime-android:1.19.2'`);
    fs.writeFileSync(ap, g);
  }
  console.log('Face lock (Kotlin + CameraX + ML Kit + ONNX) patched in');
})();

// App version: package.json is the source (scripts/bump.js). versionName = x.y.z, versionCode = x*10000 + y*100 + z.
try {
  const ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const vm = String(ver).match(/^(\d+)\.(\d+)\.(\d+)$/);
  const gp = path.join(root, 'android/app/build.gradle');
  if (vm && fs.existsSync(gp)) {
    let g = fs.readFileSync(gp, 'utf8');
    g = g.replace(/versionCode\s+\d+/, 'versionCode ' + (+vm[1] * 10000 + +vm[2] * 100 + +vm[3])).replace(/versionName\s+"[^"]*"/, 'versionName "' + ver + '"');
    fs.writeFileSync(gp, g);
    console.log('APK version set to ' + ver);
  }
} catch (e) { console.log('version patch skipped: ' + e.message); }
console.log('PhoneControl + ScreenControl plugins and accessibility service patched into android project');
