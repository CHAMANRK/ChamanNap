package com.chaman.nap;

import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

// Runs commands in Termux through its official RUN_COMMAND intent (background, no Termux screen).
@CapacitorPlugin(name = "Termux")
public class TermuxPlugin extends Plugin {

    static final String PKG = "com.termux";
    static final String BASH = "/data/data/com.termux/files/usr/bin/bash";
    static final String HOME = "/data/data/com.termux/files/home";
    static final String PERM = "com.termux.permission.RUN_COMMAND";
    // $1 = content, $2 = path (a leading ~ means the Termux home)
    static final String WRITE_SCRIPT =
        "p=\"$2\"; case \"$p\" in \"~\"*) p=\"$HOME${p#?}\";; esac; mkdir -p \"$(dirname \"$p\")\" && printf \"%s\" \"$1\" > \"$p\" && echo \"OK $p\"";

    private static final ConcurrentHashMap<Integer, PluginCall> CALLS = new ConcurrentHashMap<>();
    private static final AtomicInteger NEXT = new AtomicInteger(1);
    private final Handler main = new Handler(Looper.getMainLooper());

    private boolean installed(Context ctx) {
        try {
            ctx.getPackageManager().getPackageInfo(PKG, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        r.put("installed", installed(ctx));
        r.put("permission", ctx.checkSelfPermission(PERM) == PackageManager.PERMISSION_GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void openAppInfo(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()), "ERROR");
        }
    }

    @PluginMethod
    public void run(PluginCall call) {
        String command = call.getString("command", "");
        Integer t = call.getInt("timeout", 120);
        exec(call, new String[] { "-c", command == null ? "" : command }, t == null ? 120 : t);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String path = call.getString("path", "");
        String content = call.getString("content", "");
        exec(call, new String[] { "-c", WRITE_SCRIPT, "_", content == null ? "" : content, path == null ? "" : path }, 30);
    }

    private void exec(final PluginCall call, String[] args, int timeoutS) {
        Context ctx = getContext();
        if (!installed(ctx)) {
            call.reject("Termux install nahi hai.", "NOT_INSTALLED");
            return;
        }
        if (ctx.checkSelfPermission(PERM) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Chaman ko RUN_COMMAND permission nahi mili.", "PERMISSION");
            return;
        }
        final int id = NEXT.getAndIncrement();
        Intent result = new Intent(ctx, TermuxResultReceiver.class);
        result.putExtra("cid", id);
        int flags = PendingIntent.FLAG_ONE_SHOT;
        if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, id, result, flags);

        Intent i = new Intent("com.termux.RUN_COMMAND");
        i.setClassName(PKG, "com.termux.app.RunCommandService");
        i.putExtra("com.termux.RUN_COMMAND_PATH", BASH);
        i.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", args);
        i.putExtra("com.termux.RUN_COMMAND_WORKDIR", HOME);
        i.putExtra("com.termux.RUN_COMMAND_BACKGROUND", true);
        i.putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", pi);

        CALLS.put(id, call);
        try {
            ComponentName cn = Build.VERSION.SDK_INT >= 26 ? ctx.startForegroundService(i) : ctx.startService(i);
            if (cn == null) {
                CALLS.remove(id);
                call.reject("Termux ki service nahi mili.", "NOT_INSTALLED");
                return;
            }
        } catch (SecurityException e) {
            CALLS.remove(id);
            call.reject("Permission nahi: " + e.getMessage(), "PERMISSION");
            return;
        } catch (Exception e) {
            CALLS.remove(id);
            call.reject(String.valueOf(e.getMessage()), "ERROR");
            return;
        }
        main.postDelayed(
            new Runnable() {
                @Override
                public void run() {
                    PluginCall c = CALLS.remove(id);
                    if (c != null) {
                        JSObject r = new JSObject();
                        r.put("timeout", true);
                        c.resolve(r);
                    }
                }
            },
            Math.max(5, timeoutS) * 1000L
        );
    }

    static void deliver(int id, Bundle b) {
        PluginCall c = CALLS.remove(id);
        if (c == null) return;
        JSObject r = new JSObject();
        if (b != null) {
            r.put("stdout", b.getString("stdout", ""));
            r.put("stderr", b.getString("stderr", ""));
            r.put("exitCode", b.containsKey("exitCode") ? b.getInt("exitCode") : -1);
            r.put("errmsg", b.getString("errmsg", ""));
        }
        c.resolve(r);
    }
}
