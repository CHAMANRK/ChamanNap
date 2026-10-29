package com.chaman.nap;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import org.json.JSONArray;

// Step14: starts well-known system / app intents (alarm, timer, calendar, settings pages, camera, share ...) so the AI needs no screen taps.
// Everything is checked against fixed lists here (action, data scheme, type, category, extra keys): nothing can call, send an SMS, pay or delete.
// The catalog with the friendly names lives in www/js/intents.js (tests/sim-intents.js checks that both lists agree).
@CapacitorPlugin(name = "Intents")
public class IntentsPlugin extends Plugin {

    static final Set<String> ACTIONS = new HashSet<>(Arrays.asList(
        "android.intent.action.SET_ALARM", "android.intent.action.SHOW_ALARMS", "android.intent.action.SET_TIMER", "android.intent.action.SHOW_TIMERS",
        "android.intent.action.VIEW", "android.intent.action.INSERT", "android.intent.action.DIAL", "android.intent.action.SENDTO", "android.intent.action.SEND",
        "android.intent.action.WEB_SEARCH", "android.intent.action.VIEW_DOWNLOADS", "android.intent.action.POWER_USAGE_SUMMARY",
        "android.media.action.STILL_IMAGE_CAMERA", "android.media.action.IMAGE_CAPTURE", "android.media.action.VIDEO_CAMERA", "android.media.action.MEDIA_PLAY_FROM_SEARCH",
        "android.provider.MediaStore.RECORD_SOUND", "android.net.vpn.SETTINGS",
        "android.settings.SETTINGS", "android.settings.WIFI_SETTINGS", "android.settings.BLUETOOTH_SETTINGS", "android.settings.AIRPLANE_MODE_SETTINGS",
        "android.settings.WIRELESS_SETTINGS", "android.settings.DATA_USAGE_SETTINGS", "android.settings.DATA_ROAMING_SETTINGS", "android.settings.DISPLAY_SETTINGS",
        "android.settings.SOUND_SETTINGS", "android.settings.BATTERY_SAVER_SETTINGS", "android.settings.LOCATION_SOURCE_SETTINGS", "android.settings.NFC_SETTINGS",
        "android.settings.DATE_SETTINGS", "android.settings.LOCALE_SETTINGS", "android.settings.INPUT_METHOD_SETTINGS", "android.settings.ACCESSIBILITY_SETTINGS",
        "android.settings.SECURITY_SETTINGS", "android.settings.PRIVACY_SETTINGS", "android.settings.APPLICATION_SETTINGS", "android.settings.MANAGE_ALL_APPLICATIONS_SETTINGS",
        "android.settings.MANAGE_DEFAULT_APPS_SETTINGS", "android.settings.INTERNAL_STORAGE_SETTINGS", "android.settings.CAST_SETTINGS", "android.settings.DEVICE_INFO_SETTINGS",
        "android.settings.APPLICATION_DEVELOPMENT_SETTINGS", "android.settings.SYNC_SETTINGS", "android.settings.APPLICATION_DETAILS_SETTINGS", "android.settings.APP_NOTIFICATION_SETTINGS",
        "android.settings.panel.action.INTERNET_CONNECTIVITY", "android.settings.panel.action.WIFI", "android.settings.panel.action.NFC", "android.settings.panel.action.VOLUME"
    ));

    static final Set<String> CATEGORIES = new HashSet<>(Arrays.asList(
        "android.intent.category.APP_CALENDAR", "android.intent.category.APP_CALCULATOR", "android.intent.category.APP_CONTACTS", "android.intent.category.APP_EMAIL",
        "android.intent.category.APP_GALLERY", "android.intent.category.APP_MAPS", "android.intent.category.APP_MARKET", "android.intent.category.APP_MESSAGING",
        "android.intent.category.APP_MUSIC", "android.intent.category.APP_BROWSER"
    ));

    static final Set<String> SCHEMES = new HashSet<>(Arrays.asList("http", "https", "tel", "sms", "smsto", "mailto", "geo", "google.navigation", "market", "package", "content"));

    static final Set<String> CONTENT_PREFIXES = new HashSet<>(Arrays.asList("content://com.android.calendar/"));

    static final Set<String> TYPES = new HashSet<>(Arrays.asList("text/plain", "vnd.android.cursor.dir/contact", "vnd.android.cursor.dir/calls"));

    static final Set<String> KEYS = new HashSet<>(Arrays.asList(
        "android.intent.extra.alarm.HOUR", "android.intent.extra.alarm.MINUTES", "android.intent.extra.alarm.MESSAGE", "android.intent.extra.alarm.DAYS",
        "android.intent.extra.alarm.SKIP_UI", "android.intent.extra.alarm.LENGTH",
        "title", "description", "eventLocation", "beginTime", "endTime", "allDay",
        "name", "phone", "email", "company", "notes", "query", "android.intent.extra.focus",
        "android.intent.extra.TEXT", "android.intent.extra.SUBJECT", "android.provider.extra.APP_PACKAGE"
    ));

    static final Set<String> LONG_KEYS = new HashSet<>(Arrays.asList("beginTime", "endTime"));

    private static class Bad extends Exception {
        Bad(String m) {
            super(m);
        }
    }

    private void check(boolean ok, String msg) throws Bad {
        if (!ok) throw new Bad(msg);
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            String action = nz(call.getString("action", ""));
            String data = nz(call.getString("data", ""));
            String type = nz(call.getString("type", ""));
            String cat = nz(call.getString("category", ""));
            String pkg = nz(call.getString("pkg", ""));
            boolean chooser = Boolean.TRUE.equals(call.getBoolean("chooser", false));
            Intent i;
            if (!cat.isEmpty()) {
                check(CATEGORIES.contains(cat), "Ye app category allowed nahi hai");
                i = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, cat);
            } else {
                check(ACTIONS.contains(action), "Ye intent action allowed nahi hai");
                i = new Intent(action);
                if (!data.isEmpty()) {
                    Uri u = Uri.parse(data);
                    String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
                    check(SCHEMES.contains(sc), "Ye data type allowed nahi hai");
                    if (sc.equals("content")) {
                        boolean okc = false;
                        for (String p : CONTENT_PREFIXES) if (data.startsWith(p)) okc = true;
                        check(okc, "Ye content link allowed nahi hai");
                    }
                    if (!type.isEmpty()) {
                        check(TYPES.contains(type), "Ye type allowed nahi hai");
                        i.setDataAndType(u, type);
                    } else i.setData(u);
                } else if (!type.isEmpty()) {
                    check(TYPES.contains(type), "Ye type allowed nahi hai");
                    i.setType(type);
                }
                JSObject ex = call.getObject("extras");
                if (ex != null) {
                    Iterator<String> it = ex.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        check(KEYS.contains(k), "Ye extra allowed nahi hai: " + k);
                        Object v = ex.get(k);
                        if (v instanceof Boolean) i.putExtra(k, ((Boolean) v).booleanValue());
                        else if (v instanceof Number) {
                            if (LONG_KEYS.contains(k)) i.putExtra(k, ((Number) v).longValue());
                            else i.putExtra(k, ((Number) v).intValue());
                        } else if (v instanceof JSONArray) {
                            JSONArray a = (JSONArray) v;
                            ArrayList<Integer> L = new ArrayList<>();
                            for (int n = 0; n < a.length() && n < 7; n++) L.add(a.getInt(n));
                            i.putIntegerArrayListExtra(k, L);
                        } else if (v != null) {
                            String sv = String.valueOf(v);
                            i.putExtra(k, sv.length() > 5000 ? sv.substring(0, 5000) : sv);
                        }
                    }
                }
            }
            if (!pkg.isEmpty()) i.setPackage(pkg);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (chooser && "android.intent.action.SEND".equals(action)) {
                i = Intent.createChooser(i, null);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            }
            getContext().startActivity(i);
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        } catch (Bad e) {
            call.reject(e.getMessage(), "BAD_INTENT");
        } catch (ActivityNotFoundException e) {
            call.reject("Is kaam ke liye phone me app nahi mila", "NOT_FOUND");
        } catch (SecurityException e) {
            call.reject("Permission nahi mili: " + e.getMessage(), "PERMISSION");
        } catch (Exception e) {
            call.reject("Intent me dikkat: " + e.getMessage(), "ERROR");
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s.trim();
    }
}
