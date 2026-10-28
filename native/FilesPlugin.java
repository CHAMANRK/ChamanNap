package com.chaman.nap;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

// File tools for the workspace /sdcard/Chaman without Termux. Everything is limited to that folder
// (canonical path check, so .. and symlinks cannot escape). Needs "All files access" (Android 11+).
// Writes and edits back up the old file to backup/ first. Delete = move to .trash/.
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {

    private static final int MAX_FILE = 8 * 1024 * 1024;
    private static final int MAX_B64 = 6 * 1024 * 1024;
    private static final int KEEP_BACKUPS = 60;

    private static class Fail extends Exception {
        final String code;
        Fail(String code, String msg) {
            super(msg);
            this.code = code;
        }
    }

    // ---------- paths ----------

    private File ext() {
        return Environment.getExternalStorageDirectory();
    }

    private File root() throws IOException {
        return new File(ext(), "Chaman").getCanonicalFile();
    }

    private boolean granted() {
        if (Build.VERSION.SDK_INT >= 30) return Environment.isExternalStorageManager();
        return getContext().checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private void need() throws Fail {
        if (!granted()) {
            throw new Fail("NO_ACCESS", "Chaman ko All files access nahi mili. Settings > Files section me button dabao (ya Settings > Apps > Chaman > All files access).");
        }
    }

    // Accepts /sdcard/Chaman/..., /storage/emulated/0/Chaman/... or a path relative to the workspace.
    private File resolve(String p) throws Fail, IOException {
        if (p == null) p = "";
        p = p.trim();
        if (p.indexOf('\0') >= 0 || p.indexOf('\n') >= 0 || p.indexOf('\r') >= 0) throw new Fail("BAD_PATH", "Path galat hai.");
        String base = ext().getPath();
        if (p.equals("/sdcard")) p = base;
        else if (p.startsWith("/sdcard/")) p = base + "/" + p.substring(8);
        else if (p.equals("/storage/emulated/0")) p = base;
        else if (p.startsWith("/storage/emulated/0/")) p = base + "/" + p.substring(20);
        File r = root();
        File f;
        if (p.isEmpty() || p.equals(".")) f = r;
        else if (p.startsWith("/")) f = new File(p);
        else if (p.startsWith("~")) throw new Fail("OUTSIDE", "Sirf /sdcard/Chaman ke andar kaam hota hai.");
        else f = new File(r, p);
        File c = f.getCanonicalFile();
        String cp = c.getPath(), rp = r.getPath();
        if (!(cp.equals(rp) || cp.startsWith(rp + File.separator))) {
            throw new Fail("OUTSIDE", "Sirf /sdcard/Chaman ke andar kaam hota hai (bahar ka path nahi).");
        }
        return c;
    }

    private String top(File c) throws IOException {
        String rp = root().getPath(), cp = c.getPath();
        if (cp.equals(rp)) return "";
        String rest = cp.substring(rp.length() + 1);
        int i = rest.indexOf(File.separatorChar);
        return i < 0 ? rest : rest.substring(0, i);
    }

    private boolean isRoot(File c) throws IOException {
        return c.getPath().equals(root().getPath());
    }

    // backup/, .trash/ and logs/ are managed by the app: the AI may read there but not write.
    private void writable(File c) throws Fail, IOException {
        if (isRoot(c)) throw new Fail("PROTECTED", "Workspace folder khud ko nahi badal sakte.");
        String t = top(c);
        if (t.equals("backup") || t.equals(".trash") || t.equals("logs")) {
            throw new Fail("PROTECTED", t + "/ app ka folder hai, yahan likh/badal nahi sakte.");
        }
    }

    private String shown(File c) throws IOException {
        String rp = root().getPath(), cp = c.getPath();
        return cp.equals(rp) ? "/sdcard/Chaman" : "/sdcard/Chaman" + cp.substring(rp.length());
    }

    // ---------- io helpers ----------

    private static byte[] readBytes(File f, int max) throws IOException, Fail {
        if (f.length() > max) throw new Fail("TOO_BIG", "File bahut badi hai (" + f.length() + " bytes, max " + max + ").");
        ByteArrayOutputStream bo = new ByteArrayOutputStream((int) Math.max(32, f.length()));
        InputStream in = new FileInputStream(f);
        try {
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        } finally {
            in.close();
        }
        return bo.toByteArray();
    }

    private static boolean looksBinary(byte[] b) {
        int n = Math.min(b.length, 4096);
        for (int i = 0; i < n; i++) if (b[i] == 0) return true;
        return false;
    }

    private static String readText(File f) throws IOException, Fail {
        if (!f.exists()) throw new Fail("NOT_FOUND", "File nahi mili.");
        if (!f.isFile()) throw new Fail("NOT_FILE", "Ye file nahi, folder hai.");
        byte[] b = readBytes(f, MAX_FILE);
        if (looksBinary(b)) throw new Fail("BINARY", "Ye binary file hai (text nahi), padh/edit nahi ho sakti.");
        return new String(b, StandardCharsets.UTF_8);
    }

    private static void writeText(File f, String text) throws IOException {
        File dir = f.getParentFile();
        if (dir != null) dir.mkdirs();
        File tmp = new File(dir, "." + f.getName() + ".tmp");
        OutputStream out = new FileOutputStream(tmp);
        try {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        } finally {
            out.close();
        }
        if (!tmp.renameTo(f)) {
            OutputStream o2 = new FileOutputStream(f);
            try {
                o2.write(text.getBytes(StandardCharsets.UTF_8));
            } finally {
                o2.close();
            }
            tmp.delete();
        }
    }

    private static void copyFile(File a, File b) throws IOException {
        InputStream in = new FileInputStream(a);
        OutputStream out = new FileOutputStream(b);
        try {
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        } finally {
            in.close();
            out.close();
        }
    }

    private static String stamp() {
        return new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
    }

    // Copies an existing file to backup/ and keeps only the newest KEEP_BACKUPS. Returns true when a backup was made.
    private boolean backup(File f) throws IOException {
        if (!f.isFile() || f.length() == 0) return false;
        File dir = new File(root(), "backup");
        dir.mkdirs();
        File b = new File(dir, f.getName() + "." + stamp() + ".bak");
        int k = 1;
        while (b.exists()) b = new File(dir, f.getName() + "." + stamp() + "." + (k++) + ".bak");
        copyFile(f, b);
        File[] all = dir.listFiles();
        if (all != null && all.length > KEEP_BACKUPS) {
            Arrays.sort(all, new Comparator<File>() {
                @Override
                public int compare(File x, File y) {
                    return Long.compare(y.lastModified(), x.lastModified());
                }
            });
            for (int i = KEEP_BACKUPS; i < all.length; i++) all[i].delete();
        }
        return true;
    }

    private static int countLines(String t) {
        if (t.isEmpty()) return 0;
        int n = 1;
        for (int i = 0; i < t.length(); i++) if (t.charAt(i) == '\n') n++;
        if (t.charAt(t.length() - 1) == '\n') n--;
        return n;
    }

    private static int lineOf(String t, int idx) {
        int n = 1;
        for (int i = 0; i < idx && i < t.length(); i++) if (t.charAt(i) == '\n') n++;
        return n;
    }

    private static String mime(String name) {
        String n = name.toLowerCase(Locale.US);
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }

    private void fail(PluginCall call, Exception e) {
        if (e instanceof Fail) call.reject(e.getMessage(), ((Fail) e).code);
        else call.reject(String.valueOf(e.getMessage()), "ERROR");
    }

    // ---------- methods ----------

    @PluginMethod
    public void status(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("granted", granted());
            r.put("sdk", Build.VERSION.SDK_INT);
            r.put("exists", root().isDirectory());
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= 30) {
                i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            } else {
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(i);
            } catch (Exception e1) {
                Intent j = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
                j.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(j);
            }
            call.resolve();
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void init(PluginCall call) {
        try {
            need();
            File r = root();
            for (String d : new String[] { "", "work", "memory", "backup", ".trash", "logs" }) {
                File x = d.isEmpty() ? r : new File(r, d);
                if (!x.isDirectory() && !x.mkdirs()) throw new Fail("MKDIR", "Folder nahi bana: " + d);
            }
            JSObject o = new JSObject();
            o.put("ok", true);
            call.resolve(o);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void stat(PluginCall call) {
        try {
            need();
            File c = resolve(call.getString("path", ""));
            JSObject o = new JSObject();
            o.put("path", shown(c));
            o.put("exists", c.exists());
            o.put("dir", c.isDirectory());
            o.put("size", c.isFile() ? c.length() : 0);
            o.put("mtime", c.lastModified());
            call.resolve(o);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        try {
            need();
            File c = resolve(call.getString("path", ""));
            if (!c.exists()) throw new Fail("NOT_FOUND", "Folder nahi mila.");
            if (!c.isDirectory()) throw new Fail("NOT_DIR", "Ye folder nahi, file hai.");
            File[] all = c.listFiles();
            List<File> L = new ArrayList<>();
            if (all != null) Collections.addAll(L, all);
            Collections.sort(L, new Comparator<File>() {
                @Override
                public int compare(File x, File y) {
                    if (x.isDirectory() != y.isDirectory()) return x.isDirectory() ? -1 : 1;
                    return x.getName().compareToIgnoreCase(y.getName());
                }
            });
            JSArray arr = new JSArray();
            int n = 0;
            for (File f : L) {
                if (n++ >= 200) break;
                JSObject o = new JSObject();
                o.put("name", f.getName());
                o.put("dir", f.isDirectory());
                o.put("size", f.isFile() ? f.length() : 0);
                o.put("mtime", f.lastModified());
                arr.put(o);
            }
            JSObject r = new JSObject();
            r.put("path", shown(c));
            r.put("total", L.size());
            r.put("items", arr);
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    // read: lines start..start+max-1, text capped at maxBytes (cut on a line end).
    @PluginMethod
    public void read(PluginCall call) {
        try {
            need();
            File c = resolve(call.getString("path", ""));
            String text = readText(c);
            Integer s0 = call.getInt("start", 1), m0 = call.getInt("max", 200), b0 = call.getInt("maxBytes", 12000);
            int start = Math.max(1, s0 == null ? 1 : s0), max = Math.max(1, m0 == null ? 200 : m0), maxBytes = Math.max(200, b0 == null ? 12000 : b0);
            String[] lines = text.split("\n", -1);
            int total = countLines(text);
            int to = Math.min(total, start + max - 1);
            StringBuilder sb = new StringBuilder();
            boolean cut = false;
            int last = start - 1;
            for (int i = start - 1; i < to; i++) {
                String ln = lines[i];
                if (sb.length() + ln.length() + 1 > maxBytes) {
                    if (i == start - 1) {
                        sb.append(ln, 0, Math.min(ln.length(), maxBytes));
                        last = i + 1;
                    }
                    cut = true;
                    break;
                }
                if (i > start - 1) sb.append('\n');
                sb.append(ln);
                last = i + 1;
            }
            JSObject r = new JSObject();
            r.put("path", shown(c));
            r.put("text", sb.toString());
            r.put("lines", total);
            r.put("bytes", c.length());
            r.put("from", total == 0 ? 0 : start);
            r.put("to", last);
            r.put("truncated", cut || to < total);
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void readB64(PluginCall call) {
        try {
            need();
            File c = resolve(call.getString("path", ""));
            if (!c.isFile()) throw new Fail("NOT_FOUND", "File nahi mili.");
            byte[] b = readBytes(c, MAX_B64);
            JSObject r = new JSObject();
            r.put("b64", Base64.encodeToString(b, Base64.NO_WRAP));
            r.put("mime", mime(c.getName()));
            r.put("bytes", b.length);
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void search(PluginCall call) {
        try {
            need();
            File c = resolve(call.getString("path", ""));
            String q = call.getString("query", "");
            if (q == null || q.isEmpty()) throw new Fail("EMPTY", "Search text khaali hai.");
            boolean ic = Boolean.TRUE.equals(call.getBoolean("ignoreCase", true));
            String qq = ic ? q.toLowerCase(Locale.ROOT) : q;
            if (!c.exists()) throw new Fail("NOT_FOUND", "Path nahi mila.");
            List<File> files = new ArrayList<>();
            collect(c, files, 0);
            String t0 = top(c);
            List<File> keep = new ArrayList<>();
            for (File f : files) {
                String tf = top(f);
                if ((tf.equals("backup") && !t0.equals("backup")) || (tf.equals("logs") && !t0.equals("logs"))) continue;
                keep.add(f);
            }
            files = keep;
            JSArray hits = new JSArray();
            int scanned = 0, n = 0;
            outer:
            for (File f : files) {
                if (f.length() > 2 * 1024 * 1024) continue;
                byte[] b = readBytes(f, MAX_FILE);
                if (looksBinary(b)) continue;
                scanned++;
                String[] lines = new String(b, StandardCharsets.UTF_8).split("\n", -1);
                for (int i = 0; i < lines.length; i++) {
                    String ln = ic ? lines[i].toLowerCase(Locale.ROOT) : lines[i];
                    if (ln.contains(qq)) {
                        JSObject h = new JSObject();
                        h.put("file", shown(f));
                        h.put("line", i + 1);
                        String t = lines[i].trim();
                        h.put("text", t.length() > 200 ? t.substring(0, 200) : t);
                        hits.put(h);
                        if (++n >= 40) break outer;
                    }
                }
            }
            JSObject r = new JSObject();
            r.put("hits", hits);
            r.put("scanned", scanned);
            r.put("more", n >= 40);
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    private void collect(File f, List<File> out, int depth) {
        if (out.size() > 800 || depth > 8) return;
        if (f.isFile()) {
            out.add(f);
            return;
        }
        File[] kids = f.listFiles();
        if (kids == null) return;
        Arrays.sort(kids);
        for (File k : kids) {
            String nm = k.getName();
            if (nm.startsWith(".")) continue;
            collect(k, out, depth + 1);
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        try {
            need();
            File c = resolve(call.getString("path", ""));
            writable(c);
            String content = call.getString("content", "");
            if (content == null) content = "";
            if (content.length() > 2 * 1024 * 1024) throw new Fail("TOO_BIG", "Content bahut bada (max 2MB).");
            if (c.isDirectory()) throw new Fail("NOT_FILE", "Is naam ka folder hai, file nahi.");
            boolean existed = c.isFile();
            long old = existed ? c.length() : 0;
            boolean backed = existed && backup(c);
            writeText(c, content);
            JSObject r = new JSObject();
            r.put("path", shown(c));
            r.put("created", !existed);
            r.put("backed", backed);
            r.put("oldBytes", old);
            r.put("newBytes", c.length());
            r.put("lines", countLines(content));
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    // edit: edits = [{old,new}], applied in order on one in-memory copy; any failure writes nothing.
    @PluginMethod
    public void edit(PluginCall call) {
        try {
            need();
            File c = resolve(call.getString("path", ""));
            writable(c);
            JSArray arr = call.getArray("edits");
            if (arr == null || arr.length() == 0) throw new Fail("EMPTY", "edits khaali hain.");
            boolean all = Boolean.TRUE.equals(call.getBoolean("replaceAll", false));
            String text = readText(c);
            boolean crlf = text.contains("\r\n");
            String cur = text;
            int changes = 0, firstLine = 0, firstEnd = 0;
            List<Integer> where = new ArrayList<>();
            for (int e = 0; e < arr.length(); e++) {
                JSONObject o = arr.getJSONObject(e);
                String a = o.optString("old", "");
                String b = o.optString("new", "");
                if (a.isEmpty()) throw new Fail("EMPTY_OLD", "Edit " + (e + 1) + ": old text khaali hai.");
                if (crlf) {
                    a = a.replace("\r\n", "\n").replace("\n", "\r\n");
                    b = b.replace("\r\n", "\n").replace("\n", "\r\n");
                }
                List<Integer> pos = new ArrayList<>();
                int from = 0, ix;
                while ((ix = cur.indexOf(a, from)) >= 0) {
                    pos.add(ix);
                    from = ix + a.length();
                }
                if (pos.isEmpty()) {
                    String hint = "";
                    String fl = "";
                    for (String ln : a.split("\n")) {
                        if (ln.trim().length() >= 6) {
                            fl = ln.trim();
                            break;
                        }
                    }
                    if (!fl.isEmpty()) {
                        int k = cur.indexOf(fl);
                        if (k >= 0) hint = " Is text ki ek line line " + lineOf(cur, k) + " ke paas mili, par poora match nahi (spaces/indent/line badle ho sakte hain). file_read se dekh ke exact text lo.";
                    }
                    throw new Fail("NO_MATCH", "Edit " + (e + 1) + ": old text file me nahi mila. Kuch badla nahi." + hint);
                }
                if (pos.size() > 1 && !all) {
                    StringBuilder ls = new StringBuilder();
                    for (int i = 0; i < Math.min(5, pos.size()); i++) ls.append(i > 0 ? ", " : "").append(lineOf(cur, pos.get(i)));
                    throw new Fail("MULTI", "Edit " + (e + 1) + ": old text " + pos.size() + " jagah mila (lines " + ls + "). Kuch badla nahi. Aas-paas ki lines jodo taaki ek hi jagah match ho, ya replace_all=true do.");
                }
                if (e == 0) {
                    firstLine = lineOf(cur, pos.get(0));
                    firstEnd = firstLine + countLines(b.isEmpty() ? "x" : b) - 1;
                }
                for (int i = 0; i < pos.size() && i < 3; i++) where.add(lineOf(cur, pos.get(i)));
                if (all) {
                    cur = cur.replace(a, b);
                    changes += pos.size();
                } else {
                    int p0 = pos.get(0);
                    cur = cur.substring(0, p0) + b + cur.substring(p0 + a.length());
                    changes += 1;
                }
            }
            boolean backed = backup(c);
            long old = c.length();
            writeText(c, cur);
            String[] nl = cur.split("\n", -1);
            int s = Math.max(1, firstLine - 2), t = Math.min(countLines(cur), Math.min(firstEnd + 2, s + 13));
            StringBuilder sn = new StringBuilder();
            for (int i = s; i <= t && i <= nl.length; i++) {
                if (i > s) sn.append('\n');
                String sl = nl[i - 1].replace("\r", "");
                sn.append(i).append("| ").append(sl.length() > 200 ? sl.substring(0, 200) : sl);
            }
            JSArray wl = new JSArray();
            for (int w : where) wl.put(w);
            JSObject r = new JSObject();
            r.put("path", shown(c));
            r.put("changes", changes);
            r.put("lines", wl);
            r.put("backed", backed);
            r.put("oldBytes", old);
            r.put("newBytes", c.length());
            r.put("totalLines", countLines(cur));
            r.put("snippet", sn.toString());
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void mkdir(PluginCall call) {
        try {
            need();
            File c = resolve(call.getString("path", ""));
            writable(c);
            if (c.exists() && !c.isDirectory()) throw new Fail("EXISTS", "Is naam ki file pehle se hai.");
            boolean had = c.isDirectory();
            if (!had && !c.mkdirs()) throw new Fail("MKDIR", "Folder nahi bana.");
            JSObject r = new JSObject();
            r.put("path", shown(c));
            r.put("created", !had);
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void move(PluginCall call) {
        try {
            need();
            File a = resolve(call.getString("from", ""));
            File b = resolve(call.getString("to", ""));
            if (isRoot(a)) throw new Fail("PROTECTED", "Workspace folder ko move nahi kar sakte.");
            writable(b);
            if (!a.exists()) throw new Fail("NOT_FOUND", "Source nahi mila.");
            if (b.exists()) throw new Fail("EXISTS", "Target pehle se hai, kuch nahi badla. Alag naam do.");
            if (a.isDirectory() && (b.getPath() + File.separator).startsWith(a.getPath() + File.separator)) throw new Fail("BAD_PATH", "Folder ko apne andar move nahi kar sakte.");
            File dir = b.getParentFile();
            if (dir != null) dir.mkdirs();
            if (!a.renameTo(b)) {
                if (a.isFile()) {
                    copyFile(a, b);
                    a.delete();
                } else throw new Fail("MOVE_FAILED", "Folder move nahi hua.");
            }
            JSObject r = new JSObject();
            r.put("from", shown(a));
            r.put("to", shown(b));
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void trash(PluginCall call) {
        try {
            need();
            File c = resolve(call.getString("path", ""));
            if (isRoot(c)) throw new Fail("PROTECTED", "Workspace folder delete nahi hota.");
            if (!c.exists()) throw new Fail("NOT_FOUND", "Path nahi mila.");
            String t = top(c);
            if (t.equals(".trash")) throw new Fail("PROTECTED", "Ye pehle se .trash me hai.");
            if (t.equals("backup") || t.equals("logs")) throw new Fail("PROTECTED", t + "/ app ka folder hai, yahan se delete nahi hota.");
            File dir = new File(root(), ".trash");
            dir.mkdirs();
            File d = new File(dir, stamp() + "_" + c.getName());
            int k = 1;
            while (d.exists()) d = new File(dir, stamp() + "_" + (k++) + "_" + c.getName());
            boolean wasDir = c.isDirectory();
            if (!c.renameTo(d)) {
                if (c.isFile()) {
                    copyFile(c, d);
                    c.delete();
                } else throw new Fail("MOVE_FAILED", "Folder .trash me nahi gaya.");
            }
            JSObject r = new JSObject();
            r.put("from", shown(c));
            r.put("to", shown(d));
            r.put("dir", wasDir);
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }
}
