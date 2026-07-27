package com.sgen.controller;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.jar.Attributes;
import java.util.jar.Manifest;

/**
 * Controller for serving downloadable files (APK, etc.)
 */
@RestController
@RequestMapping("/api/downloads")
@Slf4j
public class DownloadController {

    @Value("${app.version:unknown}")
    private String appVersion;

    /**
     * Get application version from JAR manifest as fallback
     */
    private String getVersionFromManifest() {
        try {
            // Try to get version from MANIFEST.MF
            ClassPathResource manifestResource = new ClassPathResource("META-INF/MANIFEST.MF");
            if (manifestResource.exists()) {
                Manifest manifest = new Manifest(manifestResource.getInputStream());
                Attributes attributes = manifest.getMainAttributes();
                String version = attributes.getValue("Implementation-Version");
                if (version != null && !version.isEmpty()) {
                    return version;
                }
            }
        } catch (IOException e) {
            log.warn("Failed to read version from manifest", e);
        }
        return null;
    }

    /**
     * Get the effective version (from config or manifest)
     */
    private String getEffectiveVersion() {
        // If config version is set and not the placeholder, use it
        if (appVersion != null && !appVersion.equals("unknown") && !appVersion.startsWith("@")) {
            return appVersion;
        }
        // Fallback to manifest
        String manifestVersion = getVersionFromManifest();
        if (manifestVersion != null) {
            return manifestVersion;
        }
        // Final fallback
        return appVersion;
    }

    /**
     * Check if Android APK is available for download
     */
    @GetMapping("/android/status")
    public ResponseEntity<ApkStatusResponse> getApkStatus() {
        boolean available = isApkAvailable();
        String effectiveVersion = getEffectiveVersion();
        
        log.info("APK status check - Available: {}, Version: {}, Config version: {}, Working dir: {}", 
            available, effectiveVersion, appVersion, System.getProperty("user.dir"));
        
        return ResponseEntity.ok(new ApkStatusResponse(available, 
            available ? "/api/downloads/android/apk" : null,
            available ? effectiveVersion : null));
    }

    /**
     * Check if APK is available either as file or classpath resource
     */
    private boolean isApkAvailable() {
        // Try as file system resource first
        Path apkPath = getApkFilePath();
        if (apkPath.toFile().exists()) {
            log.info("APK found as file: {}", apkPath);
            return true;
        }
        
        // Try as classpath resource (for JAR deployment)
        ClassPathResource classpathResource = new ClassPathResource("static/downloads/sgen-android.apk");
        if (classpathResource.exists()) {
            log.info("APK found in classpath: static/downloads/sgen-android.apk");
            return true;
        }
        
        log.warn("APK not found in file system or classpath");
        return false;
    }

    /**
     * Get the path to the APK file on filesystem
     */
    private Path getApkFilePath() {
        // Try multiple possible locations on filesystem
        String[] possiblePaths = {
            "src/main/resources/static/downloads/sgen-android.apk",
            "target/classes/static/downloads/sgen-android.apk",
            "backend/src/main/resources/static/downloads/sgen-android.apk",
            "backend/target/classes/static/downloads/sgen-android.apk",
            "../frontend/android/app/build/outputs/apk/debug/app-debug.apk",
            "frontend/android/app/build/outputs/apk/debug/app-debug.apk",
            // When running from JAR location
            "static/downloads/sgen-android.apk"
        };
        
        for (String path : possiblePaths) {
            Path fullPath = Paths.get(path).toAbsolutePath().normalize();
            if (fullPath.toFile().exists()) {
                return fullPath;
            }
        }
        
        // Default location
        return Paths.get("src/main/resources/static/downloads/sgen-android.apk").toAbsolutePath().normalize();
    }

    /**
     * Get APK as Resource (works for both file system and classpath/JAR)
     */
    private Resource getApkResource() {
        // Try file system first
        Path apkPath = getApkFilePath();
        if (apkPath.toFile().exists()) {
            return new FileSystemResource(apkPath.toFile());
        }
        
        // Fall back to classpath (for JAR deployment)
        ClassPathResource classpathResource = new ClassPathResource("static/downloads/sgen-android.apk");
        if (classpathResource.exists()) {
            return classpathResource;
        }
        
        return null;
    }

    /**
     * Download the Android APK file
     */
    @GetMapping("/android/apk")
    public ResponseEntity<Resource> downloadApk() {
        Resource resource = getApkResource();
        
        if (resource == null) {
            log.error("APK file not found for download");
            return ResponseEntity.notFound().build();
        }
        
        log.info("Serving APK download, resource: {}", resource);
        
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sgen-android.apk\"")
                .body(resource);
    }

    /**
     * Response DTO for APK status
     */
    public record ApkStatusResponse(boolean available, String downloadUrl, String version) {}
}
