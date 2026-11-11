package com.chaman.nap;

// Tests the encrypted face backup (native/FaceBackupCrypto.java + native/FaceBackup.java) on a normal JVM.
// Android classes come from tests/java-stubs, the Keystore wrapper is swapped for a plain AES one.
// Run from the project root:
//   J="java -m jdk.compiler/com.sun.tools.javac.Main"
//   $J -d /tmp/fbout $(find tests/java-stubs -name '*.java') native/FaceBackupCrypto.java native/FaceBackup.java tests/java/com/chaman/nap/FaceBackupTest.java
//   java -cp /tmp/fbout com.chaman.nap.FaceBackupTest
import android.content.Context;
import android.content.SharedPreferences;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class FaceBackupTest {
    static int fails = 0, passes = 0;

    static void ok(boolean c, String m) {
        if (c) { passes++; System.out.println("PASS " + m); } else { fails++; System.out.println("FAIL " + m); }
    }

    static class MemPrefs implements SharedPreferences {
        final Map<String, Object> m = new HashMap<>();
        public boolean contains(String k) { return m.containsKey(k); }
        public String getString(String k, String d) { return m.containsKey(k) ? (String) m.get(k) : d; }
        public int getInt(String k, int d) { return m.containsKey(k) ? (Integer) m.get(k) : d; }
        public Editor edit() {
            return new Editor() {
                public Editor putString(String k, String v) { m.put(k, v); return this; }
                public Editor putInt(String k, int v) { m.put(k, v); return this; }
                public Editor clear() { m.clear(); return this; }
                public void apply() {}
            };
        }
    }

    static class FakeCtx extends Context {
        final File files = tmp("files");
        final MemPrefs prefs = new MemPrefs();
        public File getFilesDir() { return files; }
        public SharedPreferences getSharedPreferences(String n, int mode) { return prefs; }
    }

    static File tmp(String n) {
        try { return Files.createTempDirectory("fb-" + n).toFile(); } catch (Exception e) { throw new RuntimeException(e); }
    }

    /** Stands in for the Android Keystore: plain AES-GCM with a fixed key. */
    static class PlainWrapper implements FaceBackup.Wrapper {
        final SecretKeySpec k = new SecretKeySpec(new byte[32], "AES");
        public byte[] wrap(byte[] key) throws Exception {
            byte[] iv = FaceBackupCrypto.randomBytes(12);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, k, new GCMParameterSpec(128, iv));
            byte[] ct = c.doFinal(key), o = new byte[12 + ct.length];
            System.arraycopy(iv, 0, o, 0, 12);
            System.arraycopy(ct, 0, o, 12, ct.length);
            return o;
        }
        public byte[] unwrap(byte[] w) throws Exception {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, Arrays.copyOfRange(w, 0, 12)));
            return c.doFinal(w, 12, w.length - 12);
        }
    }

    static String code(Runnable r) { return "x"; }

    interface Thrower { void run() throws Exception; }

    static String err(Thrower t) {
        try { t.run(); return "none"; }
        catch (FaceBackup.Err e) { return e.code; }
        catch (Exception e) { return e.getClass().getSimpleName(); }
    }

    static void put(File f, String s) throws Exception { Files.write(f.toPath(), s.getBytes(StandardCharsets.UTF_8)); }
    static String get(File f) throws Exception { return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8); }

    public static void main(String[] a) throws Exception {
        final String FACES = "{\"samples\":[{\"source\":\"live\",\"ts\":1,\"emb\":{\"m\":[0.1,0.2,0.3]}}]}";

        // ---- crypto ----
        byte[] salt = FaceBackupCrypto.randomBytes(16);
        byte[] key = FaceBackupCrypto.deriveKey("hello123".toCharArray(), salt, 20000);
        byte[] plain = FACES.getBytes(StandardCharsets.UTF_8);
        byte[] f1 = FaceBackupCrypto.seal(plain, key, salt, 20000), f2 = FaceBackupCrypto.seal(plain, key, salt, 20000);
        ok(Arrays.equals(FaceBackupCrypto.open(f1, key), plain), "seal/open roundtrip");
        ok(!Arrays.equals(f1, f2), "fresh iv: same data seals differently every time");
        ok(!new String(f1, StandardCharsets.ISO_8859_1).contains("samples"), "file does not hold the plain text");
        ok(Arrays.equals(FaceBackupCrypto.openWithPass(f1, "hello123".toCharArray()), plain), "openWithPass uses the header's salt and iterations");
        ok(err(() -> FaceBackupCrypto.openWithPass(f1, "hello124".toCharArray())).equals("BadKey"), "wrong passphrase -> BadKey");
        byte[] t = f1.clone(); t[t.length - 1] ^= 1;
        ok(err(() -> FaceBackupCrypto.open(t, key)).equals("BadKey"), "changed ciphertext -> BadKey");
        byte[] h = f1.clone(); h[10] ^= 1; // salt byte in the header
        ok(err(() -> FaceBackupCrypto.open(h, key)).equals("BadKey"), "changed header (salt) -> BadKey (header is authenticated)");
        byte[] it = f1.clone(); it[7] ^= 0x01; // iteration count, still in the allowed range
        ok(err(() -> FaceBackupCrypto.open(it, key)).equals("BadKey"), "changed iterations -> BadKey");
        ok(err(() -> FaceBackupCrypto.open(Arrays.copyOf(f1, 20), key)).equals("Corrupt"), "cut short -> Corrupt");
        byte[] mg = f1.clone(); mg[0] = 'X';
        ok(err(() -> FaceBackupCrypto.open(mg, key)).equals("Corrupt"), "wrong magic -> Corrupt");
        byte[] hi = f1.clone(); hi[4] = 0x7f;
        ok(err(() -> FaceBackupCrypto.salt(hi)).equals("Corrupt"), "huge iteration count in header is refused (no DoS)");

        // ---- glue: set, auto update, uninstall, restore ----
        FaceBackup.wrapper = new PlainWrapper();
        FaceBackup.rootOverride = tmp("sdcard");
        FakeCtx c = new FakeCtx();
        ok(err(() -> FaceBackup.set(c, "abc")).equals("WEAK_PASS"), "short passphrase refused");
        ok(err(() -> FaceBackup.set(c, "hello123")).equals("NO_FACES"), "no faces enrolled -> NO_FACES");
        ok(!FaceBackup.status(c).exists && !FaceBackup.status(c).auto, "status: nothing yet");

        put(new File(c.files, "faces.json"), FACES);
        FaceBackup.set(c, "hello123");
        FaceBackup.Status s = FaceBackup.status(c);
        ok(s.exists && s.auto && s.at > 0, "set: backup file written, auto update on");
        ok(FaceBackup.file().getPath().endsWith("Chaman/backup/face.enc"), "backup lives in /sdcard/Chaman/backup/face.enc");
        ok(!get(FaceBackup.file()).contains("samples"), "backup file is not readable text");
        ok(!c.prefs.m.toString().contains("hello123"), "passphrase is not stored in prefs");

        final String FACES2 = "{\"samples\":[{\"source\":\"live\",\"ts\":1,\"emb\":{\"m\":[0.1]}},{\"source\":\"live\",\"ts\":2,\"emb\":{\"m\":[0.9]}}]}";
        byte[] before = Files.readAllBytes(FaceBackup.file().toPath());
        put(new File(c.files, "faces.json"), FACES2);
        FaceBackup.autoUpdate(c);
        ok(!Arrays.equals(before, Files.readAllBytes(FaceBackup.file().toPath())), "autoUpdate: new enroll refreshes the backup");

        // uninstall: app folder and prefs are gone, /sdcard stays
        FakeCtx fresh = new FakeCtx();
        ok(FaceBackup.status(fresh).exists && !FaceBackup.status(fresh).auto, "after uninstall: backup still there, no key");
        FaceBackup.autoUpdate(fresh);
        ok(!new File(fresh.files, "faces.json").exists(), "autoUpdate without key / faces does nothing");
        ok(err(() -> FaceBackup.restore(fresh, "wrongpass")).equals("BAD_PASS"), "restore: wrong passphrase -> BAD_PASS");
        ok(!new File(fresh.files, "faces.json").exists(), "wrong passphrase writes nothing");
        ok(err(() -> FaceBackup.restore(fresh, "")).equals("BAD_PASS"), "restore: empty passphrase -> BAD_PASS");
        FaceBackup.restore(fresh, "hello123");
        ok(get(new File(fresh.files, "faces.json")).equals(FACES2), "restore: the latest faces are back, exactly");
        ok(FaceBackup.status(fresh).auto, "restore re-arms auto update");
        put(new File(fresh.files, "faces.json"), FACES);
        FaceBackup.autoUpdate(fresh);
        FakeCtx again = new FakeCtx();
        FaceBackup.restore(again, "hello123");
        ok(get(new File(again.files, "faces.json")).equals(FACES), "same passphrase still works after the restore re-armed the backup");

        // damaged / foreign file
        put(FaceBackup.file(), "not a backup at all, just some text that is long enough to pass the length check");
        ok(err(() -> FaceBackup.restore(new FakeCtx(), "hello123")).equals("CORRUPT"), "foreign file -> CORRUPT");

        // delete
        FaceBackup.delete(fresh);
        ok(!FaceBackup.status(fresh).exists && !FaceBackup.status(fresh).auto, "delete: file and key gone");
        ok(err(() -> FaceBackup.restore(new FakeCtx(), "hello123")).equals("NO_BACKUP"), "no file -> NO_BACKUP");

        // storage not writable: key must not stay armed
        FakeCtx c2 = new FakeCtx();
        put(new File(c2.files, "faces.json"), FACES);
        File blocker = tmp("blocker");
        File asFile = new File(blocker, "Chaman");
        put(asFile, "i am a file, not a folder");
        FaceBackup.rootOverride = blocker;
        ok(err(() -> FaceBackup.set(c2, "hello123")).equals("NO_STORAGE"), "storage not writable -> NO_STORAGE");
        ok(!FaceBackup.status(c2).auto, "failed set leaves no key behind");

        System.out.println("\n" + passes + " pass, " + fails + " fail");
        System.exit(fails == 0 ? 0 : 1);
    }
}
