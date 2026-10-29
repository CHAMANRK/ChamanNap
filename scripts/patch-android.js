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
fs.writeFileSync(mp, m);
console.log('PhoneControl + ScreenControl plugins and accessibility service patched into android project');
