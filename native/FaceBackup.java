package com.chaman.nap;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Environment;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Encrypted backup of the enrolled faces (embeddings only, no photos) so they survive an uninstall.
 * File: /sdcard/Chaman/backup/face.enc (outside the app, so uninstall does not delete it); format in FaceBackupCrypto.
 * The key comes from a passphrase Najeef sets once. The derived key is also kept in app prefs wrapped by the Android Keystore,
 * so every new enroll can refresh the backup silently. After an uninstall the Keystore key is gone: restore needs the passphrase again.
 * The passphrase itself is never stored and never goes to the AI; only Settings > Face lock talks to this class.
 */
public final class FaceBackup {
    /** code: NO_FACES, WEAK_PASS, NO_STORAGE, NO_BACKUP, BAD_PASS, CORRUPT, NO_KEY */
    public static final class Err extends Exception {
        public final String code;
        public Err(String code, String msg) { super(msg); this.code = code; }
    }

    public static final class Status {
        public boolean exists, auto;
        public long at;
    }

    /** Wraps the derived key for the prefs. Real one = Android Keystore; tests swap in a plain AES one. */
    interface Wrapper {
        byte[] wrap(byte[] key) throws Exception;
        byte[] unwrap(byte[] wrapped) throws Exception;
    }

    static Wrapper wrapper = new KeystoreWrapper();
    static File rootOverride = null; // tests only: stands in for /sdcard

    private static final String PREFS = "chaman_face_backup";
    private static final String MIN_PASS_MSG = "Passphrase kam se kam 6 akshar ka rakho";

    static File dir() {
        File root = rootOverride != null ? rootOverride : Environment.getExternalStorageDirectory();
        return new File(root, "Chaman/backup");
    }

    static File file() { return new File(dir(), "face.enc"); }

    /** Same file FaceStore.kt keeps in the app's private folder. */
    static File faces(Context c) { return new File(c.getFilesDir(), "faces.json"); }

    private static boolean hasFaces(Context c) {
        File f = faces(c);
        return f.isFile() && f.length() > 0L;
    }

    static byte[] readAll(File f) throws IOException {
        try (FileInputStream in = new FileInputStream(f)) {
            java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
            return o.toByteArray();
        }
    }

    static void writeAtomic(File target, byte[] data) throws IOException {
        File tmp = new File(target.getParentFile(), target.getName() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(data);
            out.getFD().sync();
        }
        if (!tmp.renameTo(target)) {
            try (FileOutputStream out = new FileOutputStream(target)) { out.write(data); }
            tmp.delete();
        }
    }

    // ---- cached derived key (wrapped) ----

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static boolean hasKey(Context c) {
        SharedPreferences p = prefs(c);
        return p.contains("w") && p.contains("s") && p.contains("i");
    }

    private static void cacheKey(Context c, byte[] key, byte[] salt, int iter) throws Err {
        try {
            byte[] w = wrapper.wrap(key);
            prefs(c).edit()
                    .putString("w", Base64.encodeToString(w, Base64.NO_WRAP))
                    .putString("s", Base64.encodeToString(salt, Base64.NO_WRAP))
                    .putInt("i", iter)
                    .apply();
        } catch (Exception e) {
            throw new Err("NO_KEY", "Key phone ke secure storage me nahi rakh paya");
        }
    }

    private static void dropKey(Context c) {
        prefs(c).edit().clear().apply();
    }

    // ---- public API ----

    public static Status status(Context c) {
        Status s = new Status();
        File f = file();
        try {
            s.exists = f.isFile();
            s.at = s.exists ? f.lastModified() : 0L;
        } catch (SecurityException e) {
            s.exists = false;
        }
        s.auto = hasKey(c);
        if (s.auto) {
            try {
                wrapper.unwrap(Base64.decode(prefs(c).getString("w", ""), Base64.NO_WRAP));
            } catch (Exception e) {
                s.auto = false; // e.g. prefs came back from a phone backup but the Keystore key did not
            }
        }
        return s;
    }

    /** Sets (or changes) the passphrase and writes the backup now. */
    public static void set(Context c, String pass) throws Err {
        if (pass == null || pass.length() < 6) throw new Err("WEAK_PASS", MIN_PASS_MSG);
        if (!hasFaces(c)) throw new Err("NO_FACES", "Pehle face enroll karo, phir backup banega");
        char[] pw = pass.toCharArray();
        byte[] salt = FaceBackupCrypto.randomBytes(FaceBackupCrypto.SALT_LEN);
        byte[] key = null;
        try {
            key = FaceBackupCrypto.deriveKey(pw, salt, FaceBackupCrypto.ITER);
            cacheKey(c, key, salt, FaceBackupCrypto.ITER);
            try {
                writeBackup(c);
            } catch (Err e) {
                dropKey(c);
                throw e;
            }
        } catch (java.security.GeneralSecurityException e) {
            throw new Err("NO_KEY", "Passphrase se key nahi ban payi");
        } finally {
            Arrays.fill(pw, '\0');
            if (key != null) Arrays.fill(key, (byte) 0);
        }
    }

    /** Encrypts the current faces.json with the cached key and writes the backup file. */
    private static void writeBackup(Context c) throws Err {
        if (!hasKey(c)) throw new Err("NO_KEY", "Backup passphrase set nahi hai");
        byte[] key = null;
        try {
            SharedPreferences p = prefs(c);
            key = wrapper.unwrap(Base64.decode(p.getString("w", ""), Base64.NO_WRAP));
            byte[] salt = Base64.decode(p.getString("s", ""), Base64.NO_WRAP);
            byte[] data = FaceBackupCrypto.seal(readAll(faces(c)), key, salt, p.getInt("i", FaceBackupCrypto.ITER));
            File d = dir();
            d.mkdirs();
            if (!d.isDirectory()) throw new Err("NO_STORAGE", "/sdcard/Chaman/backup nahi ban paya. Files access on hai?");
            writeAtomic(file(), data);
        } catch (Err e) {
            throw e;
        } catch (IOException | SecurityException e) {
            throw new Err("NO_STORAGE", "Backup /sdcard/Chaman/backup me likh nahi paya. Files access on hai?");
        } catch (Exception e) {
            throw new Err("NO_KEY", "Backup banane ki key nahi mili. Passphrase dobara set karo");
        } finally {
            if (key != null) Arrays.fill(key, (byte) 0);
        }
    }

    /** Called after every enroll. Never throws: a backup problem must not break enrolling. */
    public static void autoUpdate(Context c) {
        try {
            if (hasKey(c) && hasFaces(c)) writeBackup(c);
        } catch (Throwable ignored) {
        }
    }

    /** Puts the backup back as the enrolled faces. Needs the passphrase (the Keystore key does not survive an uninstall). */
    public static void restore(Context c, String pass) throws Err {
        File f = file();
        byte[] file;
        try {
            if (!f.isFile()) throw new Err("NO_BACKUP", "Backup file nahi mili (/sdcard/Chaman/backup/face.enc)");
            file = readAll(f);
        } catch (IOException | SecurityException e) {
            throw new Err("NO_STORAGE", "Backup file padh nahi paya. Files access on hai?");
        }
        if (pass == null || pass.isEmpty()) throw new Err("BAD_PASS", "Passphrase likho");
        char[] pw = pass.toCharArray();
        byte[] key = null;
        try {
            byte[] salt = FaceBackupCrypto.salt(file);
            int iter = FaceBackupCrypto.iter(file);
            key = FaceBackupCrypto.deriveKey(pw, salt, iter);
            byte[] plain = FaceBackupCrypto.open(file, key);
            String text = new String(plain, StandardCharsets.UTF_8).trim();
            if (!text.startsWith("{") || !text.contains("\"samples\"")) throw new Err("CORRUPT", "Backup ke andar face data theek nahi hai");
            writeAtomic(faces(c), plain);
            cacheKey(c, key, salt, iter);
        } catch (FaceBackupCrypto.Corrupt e) {
            throw new Err("CORRUPT", e.getMessage());
        } catch (FaceBackupCrypto.BadKey e) {
            throw new Err("BAD_PASS", e.getMessage());
        } catch (IOException e) {
            throw new Err("NO_STORAGE", "Faces app me likh nahi paya");
        } catch (java.security.GeneralSecurityException e) {
            throw new Err("NO_KEY", "Passphrase se key nahi ban payi");
        } finally {
            Arrays.fill(pw, '\0');
            if (key != null) Arrays.fill(key, (byte) 0);
        }
    }

    /** Removes the backup file and forgets the key. */
    public static void delete(Context c) {
        try { file().delete(); } catch (SecurityException ignored) { }
        dropKey(c);
    }

    // ---- Android Keystore wrapper ----

    static final class KeystoreWrapper implements Wrapper {
        private static final String ALIAS = "chaman_face_backup_key";

        private SecretKey key() throws Exception {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            if (!ks.containsAlias(ALIAS)) {
                KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(256)
                        .build());
                g.generateKey();
            }
            return (SecretKey) ks.getKey(ALIAS, null);
        }

        @Override public byte[] wrap(byte[] k) throws Exception {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = c.getIV(), ct = c.doFinal(k);
            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            return out;
        }

        @Override public byte[] unwrap(byte[] w) throws Exception {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Arrays.copyOfRange(w, 0, 12)));
            return c.doFinal(w, 12, w.length - 12);
        }
    }
}
