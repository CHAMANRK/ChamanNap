// Runs in CI after `npx cap add android`: adds the native PhoneControl plugin, registers it and adds permissions.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pkgDir = path.join(root, 'android/app/src/main/java/com/chaman/nap');
fs.mkdirSync(pkgDir, { recursive: true });

fs.copyFileSync(path.join(root, 'native/PhoneControlPlugin.java'), path.join(pkgDir, 'PhoneControlPlugin.java'));

fs.writeFileSync(
  path.join(pkgDir, 'MainActivity.java'),
  `package com.chaman.nap;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhoneControlPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`
);

const mp = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let m = fs.readFileSync(mp, 'utf8');
if (!m.includes('android.permission.READ_SMS')) {
  const add = `    <uses-permission android:name="android.permission.READ_SMS" />
    <uses-permission android:name="android.permission.SEND_SMS" />
    <uses-permission android:name="android.permission.READ_CONTACTS" />
    <uses-permission android:name="android.permission.CALL_PHONE" />
    <uses-permission android:name="android.permission.WRITE_SETTINGS" />
    <uses-feature android:name="android.hardware.telephony" android:required="false" />
    <queries>
        <intent>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent>
    </queries>
`;
  if (!m.includes('<application')) throw new Error('<application> tag not found in manifest');
  m = m.replace('<application', add + '    <application');
  fs.writeFileSync(mp, m);
}
console.log('PhoneControl plugin patched into android project');
