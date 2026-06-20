package com.sgen.controller;

import com.sgen.dto.CreateUserRequest;
import com.sgen.dto.UserResponse;
import com.sgen.service.AppSettingsService;
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
