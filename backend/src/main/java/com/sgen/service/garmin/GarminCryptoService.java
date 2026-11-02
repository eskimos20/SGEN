package com.sgen.service.garmin;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-GCM encryption for Garmin tokens at rest.
 * Key = SHA-256(GARMIN_TOKEN_KEY || JWT_SECRET). Values stored as
 * "gcm:" + base64(iv(12) || ciphertext+tag). Plain values pass through.
 */
@Service
@Slf4j
public class GarminCryptoService {

    private static final String PREFIX = "gcm:";
    private final SecretKeySpec keySpec;
    private final SecureRandom random = new SecureRandom();

    public GarminCryptoService(@Value("${garmin.token-key:}") String tokenKey,
                               @Value("${jwt.secret:}") String jwtSecret) {
        String source = (tokenKey != null && !tokenKey.isBlank()) ? tokenKey : jwtSecret;
        try {
            byte[] key = MessageDigest.getInstance("SHA-256")
                    .digest(source.getBytes(StandardCharsets.UTF_8));
            this.keySpec = new SecretKeySpec(key, "AES");
        } catch (Exception e) {
            throw new IllegalStateException("Failed to init Garmin crypto", e);
        }
    }

    public String encrypt(String plain) {
        if (plain == null) return null;
        try {
            byte[] iv = new byte[12];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, new GCMParameterSpec(128, iv));
            byte[] ct = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            return PREFIX + Base64.getEncoder().encodeToString(out);
        } catch (Exception e) {
            throw new IllegalStateException("Encrypt failed", e);
        }
    }

    public String decrypt(String stored) {
        if (stored == null || !stored.startsWith(PREFIX)) return stored;
        try {
            byte[] data = Base64.getDecoder().decode(stored.substring(PREFIX.length()));
            byte[] iv = new byte[12];
            System.arraycopy(data, 0, iv, 0, iv.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, keySpec, new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(data, iv.length, data.length - iv.length), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Decrypt failed", e);
        }
    }
}
