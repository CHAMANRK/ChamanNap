package com.chaman.nap;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;
import android.os.RemoteException;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * chaman-link, Nap side (CONNECTOR.md contract v2, sections 3 and 4). JS side: www/js/connector.js.
 * No app is named here: apps are found by the action com.chaman.link.BIND, bound by package, and every message is a Bundle with key "json".
 * Methods: discover, bind, unbind, send, poll, status.
 * Incoming messages (101 MANIFEST, 102 ACK, 103 PROGRESS, 104 RESULT, 105 PONG) go into a queue that JS drains with poll (long poll).
 * Pseudo messages from here: what -1 = service process died, -2 = binding died.
 */
@CapacitorPlugin(name = "Link")
public class LinkPlugin extends Plugin {

    static final String ACTION = "com.chaman.link.BIND";
    static final String DEF_SERVICE = "com.chaman.link.LinkService";
    static final int MAX_QUEUE = 300;

    private static class Conn {
        ServiceConnection sc;
        Messenger svc;
        Messenger reply;
        boolean up;
    }

    private final Map<String, Conn> conns = new HashMap<>();
    private final ArrayList<JSObject> queue = new ArrayList<>();
    private PluginCall parked;
    private final Handler main = new Handler(Looper.getMainLooper());

    private Context ctx() {
        return getContext().getApplicationContext();
    }

    private static boolean okPkg(String p) {
        return p != null && p.matches("[A-Za-z0-9_.]{3,200}");
    }

    private void push(String pkg, int what, String json) {
        PluginCall p = null;
        synchronized (queue) {
            JSObject o = new JSObject();
            o.put("pkg", pkg);
            o.put("what", what);
            o.put("json", json == null ? "" : json);
            queue.add(o);
            while (queue.size() > MAX_QUEUE) queue.remove(0);
            if (parked != null) {
                p = parked;
                parked = null;
            }
        }
        if (p != null) resolveQueue(p);
    }

    private void resolveQueue(PluginCall call) {
        JSArray arr = new JSArray();
        synchronized (queue) {
            for (JSObject o : queue) arr.put(o);
            queue.clear();
        }
        JSObject r = new JSObject();
        r.put("items", arr);
        call.resolve(r);
    }

    /** Apps that have the link service (any app with the BIND action; the permission decides who may really bind). */
    @PluginMethod
    public void discover(PluginCall call) {
        try {
            Context c = ctx();
            PackageManager pm = c.getPackageManager();
            List<ResolveInfo> L = pm.queryIntentServices(new Intent(ACTION), 0);
            JSArray arr = new JSArray();
            for (ResolveInfo ri : L) {
                ServiceInfo si = ri.serviceInfo;
                if (si == null || si.packageName == null || si.packageName.equals(c.getPackageName())) continue;
                JSObject o = new JSObject();
                o.put("pkg", si.packageName);
                o.put("svc", si.name);
                String label = si.packageName;
                try {
                    CharSequence cs = pm.getApplicationLabel(si.applicationInfo);
                    if (cs != null) label = cs.toString();
                } catch (Exception ignored) {
                }
                o.put("label", label);
                String ver = "";
                try {
                    PackageInfo pi = pm.getPackageInfo(si.packageName, 0);
                    if (pi.versionName != null) ver = pi.versionName;
                } catch (Exception ignored) {
                }
                o.put("version", ver);
                o.put("sigOk", pm.checkSignatures(c.getPackageName(), si.packageName) == PackageManager.SIGNATURE_MATCH);
                synchronized (conns) {
                    Conn cn = conns.get(si.packageName);
                    o.put("bound", cn != null && cn.up);
                }
                arr.put(o);
            }
            JSObject r = new JSObject();
            r.put("apps", arr);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("discover fail: " + e.getMessage(), "ERROR");
        }
    }

    @PluginMethod
    public void bind(final PluginCall call) {
        final String pkg = call.getString("pkg");
        String s = call.getString("svc");
        final String svcName = (s == null || s.isEmpty()) ? DEF_SERVICE : s;
        if (!okPkg(pkg) || !svcName.matches("[A-Za-z0-9_.$]{3,250}")) {
            call.reject("pkg ya svc galat", "BAD_ARGS");
            return;
        }
        synchronized (conns) {
            Conn old = conns.get(pkg);
            if (old != null && old.up) {
                JSObject r = new JSObject();
                r.put("ok", true);
                r.put("already", true);
                call.resolve(r);
                return;
            }
            if (old != null) {
                try {
                    ctx().unbindService(old.sc);
                } catch (Exception ignored) {
                }
                conns.remove(pkg);
            }
        }
        final Conn c = new Conn();
        c.reply = new Messenger(new Handler(Looper.getMainLooper(), new Handler.Callback() {
            @Override
            public boolean handleMessage(Message m) {
                Bundle b = m.getData();
                String j = b == null ? null : b.getString("json");
                push(pkg, m.what, j);
                return true;
            }
        }));
        final boolean[] done = {false};
        c.sc = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName n, IBinder b) {
                c.svc = new Messenger(b);
                c.up = true;
                if (!done[0]) {
                    done[0] = true;
                    JSObject r = new JSObject();
                    r.put("ok", true);
                    call.resolve(r);
                }
            }

            @Override
            public void onServiceDisconnected(ComponentName n) {
                c.up = false;
                c.svc = null;
                push(pkg, -1, "{}");
            }

            @Override
            public void onBindingDied(ComponentName n) {
                c.up = false;
                c.svc = null;
                push(pkg, -2, "{}");
            }

            @Override
            public void onNullBinding(ComponentName n) {
                if (!done[0]) {
                    done[0] = true;
                    call.reject("Service ne binder nahi diya", "NO_BINDER");
                }
            }
        };
        Intent i = new Intent(ACTION);
        i.setComponent(new ComponentName(pkg, svcName));
        boolean ok;
        try {
            ok = ctx().bindService(i, c.sc, Context.BIND_AUTO_CREATE);
        } catch (SecurityException e) {
            call.reject("Permission nahi: app alag key se sign hai ya LINK permission nahi", "PERMISSION");
            return;
        } catch (Exception e) {
            call.reject("bind fail: " + e.getMessage(), "ERROR");
            return;
        }
        if (!ok) {
            try {
                ctx().unbindService(c.sc);
            } catch (Exception ignored) {
            }
            call.reject("Link service nahi mili (app install nahi, ya service nahi hai)", "NOT_FOUND");
            return;
        }
        synchronized (conns) {
            conns.put(pkg, c);
        }
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (done[0]) return;
                done[0] = true;
                synchronized (conns) {
                    if (conns.get(pkg) == c) conns.remove(pkg);
                }
                try {
                    ctx().unbindService(c.sc);
                } catch (Exception ignored) {
                }
                call.reject("Bind timeout (6 sec)", "TIMEOUT");
            }
        }, 6000);
    }

    @PluginMethod
    public void unbind(PluginCall call) {
        String pkg = call.getString("pkg");
        Conn c;
        synchronized (conns) {
            c = conns.remove(pkg);
        }
        if (c != null) {
            try {
                ctx().unbindService(c.sc);
            } catch (Exception ignored) {
            }
        }
        JSObject r = new JSObject();
        r.put("ok", true);
        call.resolve(r);
    }

    /** send({pkg, what, json}): one Message to the bound service, replies come back through poll. */
    @PluginMethod
    public void send(PluginCall call) {
        String pkg = call.getString("pkg");
        Integer what = call.getInt("what");
        String json = call.getString("json");
        if (!okPkg(pkg) || what == null || what < 1 || what > 99) {
            call.reject("pkg ya what galat", "BAD_ARGS");
            return;
        }
        if (json != null && json.length() > 200000) {
            call.reject("json bahut bada", "BAD_ARGS");
            return;
        }
        Conn c;
        synchronized (conns) {
            c = conns.get(pkg);
        }
        if (c == null || !c.up || c.svc == null) {
            call.reject("App se connection nahi hai", "NOT_BOUND");
            return;
        }
        try {
            Message m = Message.obtain(null, what);
            Bundle b = new Bundle();
            b.putString("json", json == null ? "{}" : json);
            m.setData(b);
            m.replyTo = c.reply;
            c.svc.send(m);
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        } catch (RemoteException e) {
            c.up = false;
            call.reject("App tak message nahi gaya: " + e.getMessage(), "NOT_BOUND");
        }
    }

    /** poll({wait: ms}): returns {items:[{pkg,what,json}]}. With wait > 0 and an empty queue the call is held until something arrives or wait ms pass. */
    @PluginMethod
    public void poll(final PluginCall call) {
        Integer w = call.getInt("wait");
        final int wait = w == null ? 0 : Math.max(0, Math.min(25000, w));
        PluginCall old = null;
        synchronized (queue) {
            if (!queue.isEmpty() || wait <= 0) {
                // fall through to resolve below
            } else {
                if (parked != null) old = parked;
                parked = call;
            }
        }
        if (old != null) resolveQueue(old);
        boolean isParked;
        synchronized (queue) {
            isParked = parked == call;
        }
        if (!isParked) {
            resolveQueue(call);
            return;
        }
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                PluginCall p = null;
                synchronized (queue) {
                    if (parked == call) {
                        p = parked;
                        parked = null;
                    }
                }
                if (p != null) resolveQueue(p);
            }
        }, wait);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSArray arr = new JSArray();
        synchronized (conns) {
            for (Map.Entry<String, Conn> e : conns.entrySet()) {
                JSObject o = new JSObject();
                o.put("pkg", e.getKey());
                o.put("up", e.getValue().up);
                arr.put(o);
            }
        }
        JSObject r = new JSObject();
        r.put("bound", arr);
        call.resolve(r);
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (conns) {
            for (Conn c : conns.values()) {
                try {
                    ctx().unbindService(c.sc);
                } catch (Exception ignored) {
                }
            }
            conns.clear();
        }
    }
}
