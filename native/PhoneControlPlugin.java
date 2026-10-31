package com.chaman.nap;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.Resources;
import android.database.Cursor;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.telephony.SmsManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(
    name = "PhoneControl",
    permissions = {
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "smsRead", strings = { Manifest.permission.READ_SMS }),
        @Permission(alias = "smsSend", strings = { Manifest.permission.SEND_SMS }),
        @Permission(alias = "call", strings = { Manifest.permission.CALL_PHONE })
    }
)
public class PhoneControlPlugin extends Plugin {

    private boolean torchOn = false;

    @Override
    public void load() {
        try {
            CameraManager cm = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            cm.registerTorchCallback(new CameraManager.TorchCallback() {
                @Override
                public void onTorchModeChanged(String cameraId, boolean enabled) {
                    torchOn = enabled;
                }
            }, null);
        } catch (Exception e) {
            // ignore
        }
    }

    // ---------- permission helper ----------

    private boolean ensure(PluginCall call, String... aliases) {
        boolean all = true;
        for (String a : aliases) {
            if (getPermissionState(a) != PermissionState.GRANTED) all = false;
        }
        if (all) return true;
        if (call.getData().has("_retry")) {
            call.reject("Permission nahi mili. App info me jaake allow karo.", "NO_PERMISSION");
            return false;
        }
        call.getData().put("_retry", true);
        requestPermissionForAliases(aliases, call, "permCb");
        return false;
    }

    @PermissionCallback
    private void permCb(PluginCall call) {
        String m = call.getMethodName();
        if ("findContact".equals(m)) findContact(call);
        else if ("readSms".equals(m)) readSms(call);
        else if ("sendSms".equals(m)) sendSms(call);
        else if ("dial".equals(m)) dial(call);
        else call.reject("Unknown method");
    }

    // ---------- helpers ----------

    private String last10(String s) {
        if (s == null) return "";
        String d = s.replaceAll("[^0-9]", "");
        return d.length() > 10 ? d.substring(d.length() - 10) : d;
    }

    private Set<String> numbersFor(String q) {
        Set<String> out = new HashSet<>();
        String digits = q.replaceAll("[^0-9]", "");
        if (digits.length() >= 5 && !q.matches(".*[A-Za-z].*")) {
            out.add(last10(digits));
            return out;
        }
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[] { ContactsContract.CommonDataKinds.Phone.NUMBER },
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?",
                new String[] { "%" + q + "%" },
                null
            );
            while (c != null && c.moveToNext()) out.add(last10(c.getString(0)));
        } catch (Exception e) {
            // ignore
        } finally {
            if (c != null) c.close();
        }
        return out;
    }

    private String lookupName(String number) {
        if (number == null || number.isEmpty()) return null;
        Cursor c = null;
        try {
            Uri u = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number));
            c = getContext().getContentResolver().query(u, new String[] { ContactsContract.PhoneLookup.DISPLAY_NAME }, null, null, null);
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception e) {
            // ignore
        } finally {
            if (c != null) c.close();
        }
        return null;
    }

    // ---------- torch ----------

    @PluginMethod
    public void torch(PluginCall call) {
        try {
            CameraManager cm = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            String id = null;
            for (String cid : cm.getCameraIdList()) {
                CameraCharacteristics ch = cm.getCameraCharacteristics(cid);
                Boolean flash = ch.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                Integer facing = ch.get(CameraCharacteristics.LENS_FACING);
                if (flash != null && flash && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    id = cid;
                    break;
                }
            }
            if (id == null) {
                call.reject("Flash nahi mila");
                return;
            }
            boolean on = call.hasOption("on") ? call.getBoolean("on", false) : !torchOn;
            cm.setTorchMode(id, on);
            torchOn = on;
            JSObject r = new JSObject();
            r.put("on", on);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Torch fail: " + e.getMessage());
        }
    }

    // ---------- volume ----------

    @PluginMethod
    public void volume(PluginCall call) {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            String st = call.getString("stream", "media");
            int stream = AudioManager.STREAM_MUSIC;
            if ("ring".equals(st)) stream = AudioManager.STREAM_RING;
            else if ("alarm".equals(st)) stream = AudioManager.STREAM_ALARM;
            int max = am.getStreamMaxVolume(stream);
            int cur = am.getStreamVolume(stream);
            int target = cur;
            boolean change = false;
            if (call.hasOption("level")) {
                Integer lv = call.getInt("level", 0);
                target = Math.round((lv == null ? 0 : lv) * max / 100f);
                change = true;
            } else if (call.hasOption("delta")) {
                Integer d = call.getInt("delta", 0);
                target = cur + (d == null ? 0 : d) * Math.max(1, Math.round(max / 7f));
                change = true;
            }
            target = Math.max(0, Math.min(max, target));
            if (change) am.setStreamVolume(stream, target, AudioManager.FLAG_SHOW_UI);
            JSObject r = new JSObject();
            r.put("level", Math.round(am.getStreamVolume(stream) * 100f / max));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Volume fail: " + e.getMessage());
        }
    }

    // ---------- brightness ----------

    private int maxBrightness() {
        try {
            int id = Resources.getSystem().getIdentifier("config_screenBrightnessSettingMaximum", "integer", "android");
            if (id > 0) return Resources.getSystem().getInteger(id);
        } catch (Exception e) {
            // ignore
        }
        return 255;
    }

    // specialStatus / requestWriteSettings: "Modify system settings" is a special permission (not a normal popup). Used by the permission cards.
    @PluginMethod
    public void specialStatus(PluginCall call) {
        JSObject r = new JSObject();
        r.put("writeSettings", Settings.System.canWrite(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void requestWriteSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()), "ERROR");
        }
    }

    @PluginMethod
    public void brightness(PluginCall call) {
        Context ctx = getContext();
        if (!Settings.System.canWrite(ctx)) {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
            } catch (Exception e) {
                // ignore
            }
            call.reject("Modify system settings permission chahiye", "NEED_WRITE_SETTINGS");
            return;
        }
        try {
            ContentResolver cr = ctx.getContentResolver();
            JSObject r = new JSObject();
            if (call.hasOption("auto") && call.getBoolean("auto", false)) {
                Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC);
                r.put("auto", true);
                call.resolve(r);
                return;
            }
            int max = maxBrightness();
            int cur = Settings.System.getInt(cr, Settings.System.SCREEN_BRIGHTNESS, max / 2);
            int target = cur;
            boolean change = false;
            if (call.hasOption("level")) {
                Integer lv = call.getInt("level", 50);
                target = Math.round((lv == null ? 50 : lv) * max / 100f);
                change = true;
            } else if (call.hasOption("delta")) {
                Integer d = call.getInt("delta", 0);
                target = cur + (d == null ? 0 : d) * Math.round(max * 0.15f);
                change = true;
            }
            target = Math.max(1, Math.min(max, target));
            if (change) {
                Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
                Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS, target);
            }
            r.put("level", Math.round(target * 100f / max));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Brightness fail: " + e.getMessage());
        }
    }

    // ---------- open app ----------

    @PluginMethod
    public void openApp(PluginCall call) {
        String name = call.getString("name", "");
        name = name == null ? "" : name.toLowerCase().trim();
        if (name.isEmpty()) {
            call.reject("Naam nahi mila", "NOT_FOUND");
            return;
        }
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent main = new Intent(Intent.ACTION_MAIN, null);
            main.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> list = pm.queryIntentActivities(main, 0);
            ResolveInfo best = null;
            int bestScore = 0;
            for (ResolveInfo ri : list) {
                String label = ri.loadLabel(pm).toString().toLowerCase();
                int score = 0;
                if (label.equals(name)) score = 3;
                else if (label.startsWith(name)) score = 2;
                else if (label.contains(name) || (label.length() >= 3 && name.contains(label))) score = 1;
                if (score > bestScore) {
                    best = ri;
                    bestScore = score;
                }
            }
            if (best == null) {
                call.reject("App nahi mila", "NOT_FOUND");
                return;
            }
            Intent launch = pm.getLaunchIntentForPackage(best.activityInfo.packageName);
            if (launch == null) {
                launch = new Intent(Intent.ACTION_MAIN);
                launch.addCategory(Intent.CATEGORY_LAUNCHER);
                launch.setClassName(best.activityInfo.packageName, best.activityInfo.name);
            }
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(launch);
            JSObject r = new JSObject();
            r.put("label", best.loadLabel(pm).toString());
            call.resolve(r);
        } catch (Exception e) {
            call.reject("App kholne me dikkat: " + e.getMessage());
        }
    }

    // ---------- deep links ----------

    @PluginMethod
    public void openUrl(PluginCall call) {
        String uri = call.getString("uri", "");
        String pkg = call.getString("app", "");
        if (uri == null || uri.trim().isEmpty()) {
            call.reject("Link khali hai");
            return;
        }
        try {
            Uri u = Uri.parse(uri.trim());
            String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
            String[] ok = { "http", "https", "tel", "sms", "smsto", "mailto", "geo", "whatsapp", "tg", "upi", "market", "google.navigation", "youtube", "vnd.youtube", "spotify" };
            boolean allowed = false;
            for (String s : ok) {
                if (s.equals(sc)) allowed = true;
            }
            if (!allowed) {
                call.reject("Ye link type allowed nahi hai", "BAD_URI");
                return;
            }
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (pkg != null && !pkg.trim().isEmpty()) i.setPackage(pkg.trim());
            getContext().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Is link ko kholne wala app nahi mila", "NOT_FOUND");
        } catch (Exception e) {
            call.reject("Link kholne me dikkat: " + e.getMessage());
        }
    }

    // ---------- contacts ----------

    @PluginMethod
    public void findContact(PluginCall call) {
        if (!ensure(call, "contacts")) return;
        String name = call.getString("name", "");
        JSArray arr = new JSArray();
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[] { ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER },
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?",
                new String[] { "%" + name + "%" },
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            );
            Set<String> seen = new HashSet<>();
            while (c != null && c.moveToNext() && arr.length() < 5) {
                String n = c.getString(0);
                String num = c.getString(1);
                String key = num == null ? "" : num.replaceAll("[^0-9+]", "");
                if (key.isEmpty() || !seen.add(last10(key))) continue;
                JSObject o = new JSObject();
                o.put("name", n);
                o.put("number", key);
                arr.put(o);
            }
        } catch (Exception e) {
            call.reject("Contacts padhne me dikkat: " + e.getMessage());
            return;
        } finally {
            if (c != null) c.close();
        }
        JSObject r = new JSObject();
        r.put("matches", arr);
        call.resolve(r);
    }

    // ---------- SMS ----------

    @PluginMethod
    public void readSms(PluginCall call) {
        if (!ensure(call, "smsRead", "contacts")) return;
        Cursor c = null;
        try {
            String q = call.getString("query", "");
            q = q == null ? "" : q.trim();
            Integer lim = call.getInt("limit", 5);
            int limit = Math.max(1, Math.min(10, lim == null ? 5 : lim));
            Set<String> nums = q.isEmpty() ? new HashSet<String>() : numbersFor(q);
            String ql = q.toLowerCase();
            JSArray out = new JSArray();
            c = getContext().getContentResolver().query(
                Uri.parse("content://sms/inbox"),
                new String[] { "address", "body", "date" },
                null,
                null,
                "date DESC"
            );
            int scanned = 0;
            while (c != null && c.moveToNext() && out.length() < limit && scanned < 800) {
                scanned++;
                String addr = c.getString(0) == null ? "" : c.getString(0);
                if (!q.isEmpty()) {
                    boolean ok = nums.contains(last10(addr)) || addr.toLowerCase().contains(ql);
                    if (!ok) continue;
                }
                JSObject o = new JSObject();
                o.put("address", addr);
                String nm = lookupName(addr);
                if (nm != null) o.put("name", nm);
                o.put("body", c.getString(1));
                o.put("date", c.getLong(2));
                out.put(o);
            }
            JSObject r = new JSObject();
            r.put("messages", out);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("SMS padhne me dikkat: " + e.getMessage());
        } finally {
            if (c != null) c.close();
        }
    }

    @PluginMethod
    public void sendSms(PluginCall call) {
        if (!ensure(call, "smsSend")) return;
        String number = call.getString("number", "");
        String text = call.getString("text", "");
        if (number == null || number.isEmpty() || text == null || text.isEmpty()) {
            call.reject("Number ya text khali hai");
            return;
        }
        try {
            SmsManager sm;
            if (Build.VERSION.SDK_INT >= 31) sm = getContext().getSystemService(SmsManager.class);
            else sm = SmsManager.getDefault();
            ArrayList<String> parts = sm.divideMessage(text);
            if (parts.size() > 1) sm.sendMultipartTextMessage(number, null, parts, null, null);
            else sm.sendTextMessage(number, null, text, null, null);
            call.resolve();
        } catch (Exception e) {
            call.reject("SMS fail: " + e.getMessage());
        }
    }

    // ---------- call ----------

    @PluginMethod
    public void dial(PluginCall call) {
        if (!ensure(call, "call")) return;
        String number = call.getString("number", "");
        if (number == null || number.isEmpty()) {
            call.reject("Number khali hai");
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(number)));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Call fail: " + e.getMessage());
        }
    }
}
