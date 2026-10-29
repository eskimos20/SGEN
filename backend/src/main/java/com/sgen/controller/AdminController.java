package com.sgen.controller;

import com.sgen.dto.CreateUserRequest;
import com.sgen.dto.DatabaseSettingsRequest;
import com.sgen.dto.UserResponse;
import com.sgen.service.AppSettingsService;
import com.sgen.service.DatabaseSettingsService;
import com.sgen.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final UserService userService;
    private final AppSettingsService appSettingsService;
    private final DatabaseSettingsService databaseSettingsService;

    @GetMapping("/database")
    public ResponseEntity<Map<String, Object>> getDatabaseSettings() {
        return ResponseEntity.ok(Map.of(
                "settings", databaseSettingsService.getSettings(),
                "defaultDatabaseName", DatabaseSettingsService.DEFAULT_DATABASE_NAME,
                "bootstrapMode", databaseSettingsService.isBootstrapMode()
        ));
    }

    @PostMapping("/database/test")
    public ResponseEntity<DatabaseSettingsService.ConnectionTestResult> testDatabaseConnection(
            @Valid @RequestBody DatabaseSettingsRequest request) {
        return ResponseEntity.ok(databaseSettingsService.testAndDescribe(
                request.host(), request.port(), request.databaseName(), request.username(), request.password()));
    }

    @PostMapping("/database")
    public ResponseEntity<Map<String, Object>> saveDatabaseSettings(
            @Valid @RequestBody DatabaseSettingsRequest request) {
        DatabaseSettingsService.ConnectionTestResult test = databaseSettingsService.testAndDescribe(
                request.host(), request.port(), request.databaseName(), request.username(), request.password());
        if (!test.serverOnline() || !test.canConnectToDatabase()) {
            return ResponseEntity.badRequest().body(Map.of("message", test.message()));
        }
        return ResponseEntity.ok(Map.of(
                "settings", databaseSettingsService.save(request.host(), request.port(), request.databaseName(), request.username(), request.password()),
                "databaseName", request.databaseName(),
                "requiresRestart", true,
                "message", "Databasinställningarna sparades. Starta om SGEN-tjänsten för att använda MySQL."
        ));
    }

    // User Management
    @GetMapping("/users")
    public ResponseEntity<List<UserResponse>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
    }

    @PostMapping("/users")
    public ResponseEntity<UserResponse> createUser(@Valid @RequestBody CreateUserRequest request) {
        return ResponseEntity.ok(userService.createUser(request));
    }

    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Map<String, String>> deleteUser(@PathVariable Long userId) {
        userService.deleteUser(userId);
        return ResponseEntity.ok(Map.of("message", "User deleted successfully"));
    }

    // Debug Settings
    @GetMapping("/settings/debug")
    public ResponseEntity<Map<String, Object>> getDebugSettings() {
        return ResponseEntity.ok(Map.of(
                "dumpActivityStreams", appSettingsService.isDumpActivityStreamsEnabled()
        ));
    }

    @PostMapping("/settings/debug/dump-streams")
    public ResponseEntity<Map<String, String>> setDumpActivityStreams(@RequestBody Map<String, Boolean> request) {
        boolean enabled = request.getOrDefault("enabled", false);
        appSettingsService.setDumpActivityStreams(enabled);
        return ResponseEntity.ok(Map.of(
                "message", "Activity stream dump " + (enabled ? "enabled" : "disabled")
        ));
    }
}
