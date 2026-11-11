package com.chaman.nap;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Face backup file format and crypto (pure JVM, no Android classes, so it is unit tested on a normal JVM).
 *
 * File: "CFB1" | iterations (int32, big endian) | salt (16) | iv (12) | AES-256-GCM(ciphertext + 16 byte tag).
 * The first 24 bytes (magic, iterations, salt) are the GCM associated data, so changing the header makes the file fail to open.
 * Key = PBKDF2-HMAC-SHA256(passphrase, salt, iterations). A wrong passphrase and a damaged file both fail the GCM tag.
 */
public final class FaceBackupCrypto {
    public static final int ITER = 400000;
    static final byte[] MAGIC = "CFB1".getBytes(StandardCharsets.US_ASCII);
    static final int SALT_LEN = 16, IV_LEN = 12, TAG_BITS = 128;
    static final int HEADER = 4 + 4 + SALT_LEN;
    static final int MIN_ITER = 10000, MAX_ITER = 5000000;
    private static final SecureRandom RNG = new SecureRandom();

    /** The file is not one of ours or is cut short / damaged in its header. */
    public static final class Corrupt extends Exception {
        public Corrupt(String m) { super(m); }
    }

    /** Wrong passphrase / wrong key, or the content was changed (cannot be told apart). */
    public static final class BadKey extends Exception {
        public BadKey(String m) { super(m); }
    }

    private FaceBackupCrypto() {}

    public static byte[] randomBytes(int n) {
        byte[] b = new byte[n];
        RNG.nextBytes(b);
        return b;
    }

    public static byte[] deriveKey(char[] pass, byte[] salt, int iter) throws GeneralSecurityException {
        PBEKeySpec spec = new PBEKeySpec(pass, salt, iter, 256);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } finally {
            spec.clearPassword();
        }
    }

    /** Encrypts plain with an already derived key; a fresh random iv every time. */
    public static byte[] seal(byte[] plain, byte[] key, byte[] salt, int iter) throws GeneralSecurityException {
        if (salt.length != SALT_LEN) throw new GeneralSecurityException("salt length");
        byte[] header = ByteBuffer.allocate(HEADER).put(MAGIC).putInt(iter).put(salt).array();
        byte[] iv = randomBytes(IV_LEN);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(TAG_BITS, iv));
        c.updateAAD(header);
        byte[] ct = c.doFinal(plain);
        return ByteBuffer.allocate(HEADER + IV_LEN + ct.length).put(header).put(iv).put(ct).array();
    }

    private static void checkHeader(byte[] file) throws Corrupt {
        if (file == null || file.length < HEADER + IV_LEN + TAG_BITS / 8) throw new Corrupt("Backup file adhoori hai");
        for (int i = 0; i < MAGIC.length; i++) if (file[i] != MAGIC[i]) throw new Corrupt("Ye Chaman face backup file nahi hai");
        int it = iter(file);
        if (it < MIN_ITER || it > MAX_ITER) throw new Corrupt("Backup file ka header kharab hai");
    }

    public static int iter(byte[] file) {
        return ByteBuffer.wrap(file, 4, 4).getInt();
    }

    public static byte[] salt(byte[] file) throws Corrupt {
        checkHeader(file);
        return Arrays.copyOfRange(file, 8, 8 + SALT_LEN);
    }

    /** Opens a file with a derived key. */
    public static byte[] open(byte[] file, byte[] key) throws Corrupt, BadKey {
        checkHeader(file);
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(TAG_BITS, Arrays.copyOfRange(file, HEADER, HEADER + IV_LEN)));
            c.updateAAD(file, 0, HEADER);
            return c.doFinal(file, HEADER + IV_LEN, file.length - HEADER - IV_LEN);
        } catch (GeneralSecurityException e) {
            throw new BadKey("Passphrase galat hai ya backup file kharab hai");
        }
    }

    /** Derives the key from the passphrase using the file's own salt and iterations, then opens it. */
    public static byte[] openWithPass(byte[] file, char[] pass) throws Corrupt, BadKey, GeneralSecurityException {
        checkHeader(file);
        byte[] key = deriveKey(pass, salt(file), iter(file));
        try {
            return open(file, key);
        } finally {
            Arrays.fill(key, (byte) 0);
        }
    }
}
