package com.sgen.controller;

import com.sgen.dto.UserProfileRequest;
import com.sgen.dto.UserResponse;
import com.sgen.service.AIUsageService;
import com.sgen.service.IntervalsService;
import com.sgen.service.OpenAIService;
import com.sgen.service.UserService;
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
    private final OpenAIService openAIService;
    private final AIUsageService aiUsageService;

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
        return scheme + "://" + host + portStr + "/api/strava/callback";
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
        UserProfileRequest request = new UserProfileRequest();
        request.setOpenaiEnabled(false);
        request.setOpenaiApiKey(null);
        request.setOpenaiModel(null);
        request.setOpenaiConnectionTested(false);
        userService.updateUserProfile(authentication.getName(), request);
        return ResponseEntity.ok(Map.of("message", "OpenAI disabled and configuration cleared"));
    }

    @PostMapping("/openai/test")
    public ResponseEntity<Map<String, Object>> testUserOpenAIConnection(
            Authentication authentication,
            @RequestBody Map<String, String> request) {
        String apiKey = request.get("apiKey");
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

    // User AI Usage Statistics
    @GetMapping("/ai-usage")
    public ResponseEntity<Map<String, Object>> getUserAIUsage(
            Authentication authentication,
            @RequestParam(defaultValue = "10.50") double usdToSekRate) {
        return ResponseEntity.ok(aiUsageService.getUserMonthlyUsage(authentication.getName(), usdToSekRate));
    }
}
