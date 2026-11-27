package com.sgen.controller;

import com.sgen.dto.UserProfileRequest;
import com.sgen.dto.UserResponse;
import com.sgen.entity.User;
import com.sgen.service.AIUsageService;
import com.sgen.service.IntervalsClientFactory;
import com.sgen.service.IntervalsService;
import com.sgen.service.OpenAIService;
import com.sgen.service.UserService;
import com.sgen.service.ZwiftService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/user")
@RequiredArgsConstructor
@PreAuthorize("hasRole('USER')")
@Slf4j
public class UserController {

    private final UserService userService;
    private final IntervalsService intervalsService;
    private final IntervalsClientFactory intervalsClientFactory;
    private final OpenAIService openAIService;
    private final AIUsageService aiUsageService;
    private final ZwiftService zwiftService;

    @GetMapping("/me")
    public ResponseEntity<UserResponse> getCurrentUser(
            Authentication authentication,
            HttpServletRequest request) {
        String redirectUri = buildRedirectUri(request);
        return ResponseEntity.ok(userService.getCurrentUser(authentication.getName(), redirectUri));
    }

    private String buildRedirectUri(HttpServletRequest request) {
        String scheme = request.getHeader("X-Forwarded-Proto");
        String host = request.getHeader("X-Forwarded-Host");
        String serverName = request.getServerName();
        int port = request.getServerPort();
        
        // First try X-Forwarded-Proto from reverse proxy
        if (scheme == null) {
            // Fallback to environment variable or request scheme
            String forceHttps = System.getenv("FORCE_HTTPS");
            if ("true".equalsIgnoreCase(forceHttps)) {
                scheme = "https";
            } else {
                scheme = request.getScheme();
            }
        }
        if (host == null) {
            host = serverName;
        }
        String portStr = (port == 80 || port == 443) ? "" : ":" + port;
        return scheme + "://" + host + portStr + "/api/garmin/callback";
    }

    @PutMapping("/profile")
    public ResponseEntity<Map<String, String>> updateProfile(
            Authentication authentication,
            @Valid @RequestBody UserProfileRequest request) {
        userService.updateUserProfile(authentication.getName(), request);
        return ResponseEntity.ok(Map.of("message", "Profile updated successfully"));
    }

    @GetMapping("/intervals/test")
    public ResponseEntity<Map<String, Object>> testIntervalsConnection(Authentication authentication) {
        boolean success = intervalsService.testConnection(authentication.getName());
        return ResponseEntity.ok(Map.of(
                "success", success,
                "message", success ? "Connection successful" : "Connection failed"
        ));
    }

    @DeleteMapping("/intervals")
    public ResponseEntity<Map<String, String>> deleteIntervalsSettings(Authentication authentication) {
        User user = userService.getUserEntityByUsername(authentication.getName());
        intervalsClientFactory.evict(user.getIntervalsApiKey());
        user.setIntervalsApiKey(null);
        user.setIntervalsAthleteId(null);
        user.setIntervalsEnabled(false);
        userService.saveUser(user);
        return ResponseEntity.ok(Map.of("message", "Intervals.icu settings deleted"));
    }

    @GetMapping("/openai/enabled")
    public ResponseEntity<Map<String, Boolean>> isOpenAIEnabled(Authentication authentication) {
        UserResponse user = userService.getCurrentUser(authentication.getName());
        return ResponseEntity.ok(Map.of("enabled",
                user.getOpenaiEnabled() != null && user.getOpenaiEnabled()
                        && user.getOpenaiConnectionTested() != null && user.getOpenaiConnectionTested()));
    }

    // User-level OpenAI Configuration
    @GetMapping("/openai/config")
    public ResponseEntity<Map<String, Object>> getUserOpenAIConfig(Authentication authentication) {
        UserResponse user = userService.getCurrentUser(authentication.getName());
        return ResponseEntity.ok(Map.of(
                "enabled", user.getOpenaiEnabled() != null ? user.getOpenaiEnabled() : false,
                "apiKey", user.isHasOpenAIConfig() ? "••••••••••••••••" : "",
                "selectedModel", user.getOpenaiModel() != null ? user.getOpenaiModel() : "",
                "connectionTested", user.getOpenaiConnectionTested() != null ? user.getOpenaiConnectionTested() : false
        ));
    }

    @PostMapping("/openai/enable")
    public ResponseEntity<Map<String, String>> enableUserOpenAI(Authentication authentication) {
        UserProfileRequest request = new UserProfileRequest();
        request.setOpenaiEnabled(true);
        request.setOpenaiConnectionTested(false);
        userService.updateUserProfile(authentication.getName(), request);
        return ResponseEntity.ok(Map.of("message", "OpenAI enabled for user"));
    }

    @PostMapping("/openai/disable")
    public ResponseEntity<Map<String, String>> disableUserOpenAI(Authentication authentication) {
        // Values stay in the DB — Off is a pause, not a delete. The trash
        // can (DELETE /user/openai) is the destructive path.
        UserProfileRequest request = new UserProfileRequest();
        request.setOpenaiEnabled(false);
        userService.updateUserProfile(authentication.getName(), request);
        return ResponseEntity.ok(Map.of("message", "OpenAI disabled for user"));
    }

    @DeleteMapping("/openai")
    public ResponseEntity<Map<String, String>> deleteOpenAISettings(Authentication authentication) {
        User user = userService.getUserEntityByUsername(authentication.getName());
        user.setOpenaiApiKey(null);
        user.setOpenaiModel(null);
        user.setOpenaiConnectionTested(false);
        user.setOpenaiEnabled(false);
        userService.saveUser(user);
        return ResponseEntity.ok(Map.of("message", "OpenAI settings deleted"));
    }

    @PostMapping("/openai/test")
    public ResponseEntity<Map<String, Object>> testUserOpenAIConnection(
            Authentication authentication,
            @RequestBody Map<String, String> request) {
        String apiKey = request.get("apiKey");
        if (apiKey == null || apiKey.isBlank() || apiKey.contains("•")) {
            // Masked placeholder — use the stored key (same fallback as Zwift).
            apiKey = userService.getUserEntityByUsername(authentication.getName()).getOpenaiApiKey();
        }
        if (apiKey == null || apiKey.isBlank()) {
            return ResponseEntity.ok(Map.of("success", false, "message", "No OpenAI API key configured"));
        }
        boolean success = openAIService.testConnection(apiKey);

        if (success) {
            // Save the API key and mark as tested
            UserProfileRequest updateRequest = new UserProfileRequest();
            updateRequest.setOpenaiApiKey(apiKey);
            updateRequest.setOpenaiConnectionTested(true);
            userService.updateUserProfile(authentication.getName(), updateRequest);
        }

        return ResponseEntity.ok(Map.of(
                "success", success,
                "message", success ? "Connection successful" : "Connection failed"
        ));
    }

    @GetMapping("/openai/models")
    public ResponseEntity<List<String>> getUserOpenAIModels(Authentication authentication) {
        // Get user's API key and fetch models
        UserResponse user = userService.getCurrentUser(authentication.getName());
        // Check if user has enabled OpenAI, has a connection tested, and has API key configured
        if (user.getOpenaiEnabled() == null || !user.getOpenaiEnabled()
                || user.getOpenaiConnectionTested() == null || !user.getOpenaiConnectionTested()) {
            throw new RuntimeException("OpenAI not configured. Please enable OpenAI and test your API key first.");
        }
        // Get the actual user entity to access the API key
        var userEntity = userService.getUserEntityByUsername(authentication.getName());
        if (userEntity.getOpenaiApiKey() == null || userEntity.getOpenaiApiKey().isBlank()) {
            throw new RuntimeException("OpenAI API key not found");
        }
        return ResponseEntity.ok(openAIService.getModelsForUser(userEntity.getOpenaiApiKey()));
    }

    @PostMapping("/openai/model")
    public ResponseEntity<Map<String, String>> selectUserOpenAIModel(
            Authentication authentication,
            @RequestBody Map<String, String> request) {
        String model = request.get("model");
        UserProfileRequest updateRequest = new UserProfileRequest();
        updateRequest.setOpenaiModel(model);
        userService.updateUserProfile(authentication.getName(), updateRequest);
        return ResponseEntity.ok(Map.of("message", "Model selected: " + model));
    }


    // User-level Zwift Configuration
    @PostMapping("/zwift/enable")
    public ResponseEntity<Map<String, String>> enableUserZwift(Authentication authentication) {
        UserProfileRequest request = new UserProfileRequest();
        request.setZwiftEnabled(true);
        userService.updateUserProfile(authentication.getName(), request);
        return ResponseEntity.ok(Map.of("message", "Zwift enabled for user"));
    }

    @PostMapping("/zwift/disable")
    public ResponseEntity<Map<String, String>> disableUserZwift(Authentication authentication) {
        UserProfileRequest request = new UserProfileRequest();
        request.setZwiftEnabled(false);
        userService.updateUserProfile(authentication.getName(), request);
        return ResponseEntity.ok(Map.of("message", "Zwift disabled for user"));
    }

    @DeleteMapping("/zwift")
    public ResponseEntity<Map<String, String>> deleteZwiftSettings(Authentication authentication) {
        User user = userService.getUserEntityByUsername(authentication.getName());
        user.setZwiftUsername(null);
        user.setZwiftPassword(null);
        user.setZwiftPlayerId(null);
        user.setZwiftEnabled(false);
        userService.saveUser(user);
        return ResponseEntity.ok(Map.of("message", "Zwift settings deleted"));
    }

    @PostMapping("/zwift/test")
    public ResponseEntity<Map<String, Object>> testZwiftConnection(
            Authentication authentication,
            @RequestBody(required = false) Map<String, String> request) {
        User user = userService.getUserEntityByUsername(authentication.getName());
        String zwiftUsername = request != null ? request.get("username") : null;
        String zwiftPassword = request != null ? request.get("password") : null;
        if (zwiftUsername == null || zwiftUsername.isBlank()) {
            zwiftUsername = user.getZwiftUsername();
        }
        if (zwiftPassword == null || zwiftPassword.isBlank() || zwiftPassword.contains("•")) {
            zwiftPassword = user.getZwiftPassword();
        }
        if (zwiftUsername == null || zwiftPassword == null) {
            return ResponseEntity.ok(Map.of("success", false, "message", "No Zwift credentials configured"));
        }
        try {
            Map<String, Object> result = zwiftService.testConnection(zwiftUsername, zwiftPassword);
            // Persist credentials and player id on successful verification
            user.setZwiftUsername(zwiftUsername);
            user.setZwiftPassword(zwiftPassword);
            user.setZwiftPlayerId(((Number) result.get("playerId")).longValue());
            userService.saveUser(user);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("success", false, "message", "Connection failed: " + e.getMessage()));
        }
    }

    // User AI Usage Statistics
    @GetMapping("/ai-usage")
    public ResponseEntity<Map<String, Object>> getUserAIUsage(
            Authentication authentication,
            @RequestParam(defaultValue = "10.50") double usdToSekRate) {
        return ResponseEntity.ok(aiUsageService.getUserMonthlyUsage(authentication.getName(), usdToSekRate));
    }
}
