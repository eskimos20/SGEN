package com.sgen.controller;

import com.sgen.dto.ChangePasswordRequest;
import com.sgen.dto.LoginRequest;
import com.sgen.dto.LoginResponse;
import com.sgen.service.UserService;
import com.sgen.service.DatabaseSettingsService;
import com.sgen.security.JwtService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final UserService userService;
    private final DatabaseSettingsService databaseSettingsService;
    private final JwtService jwtService;

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        String origin = httpRequest.getHeader("Origin");
        String userAgent = httpRequest.getHeader("User-Agent");
        log.info("Login attempt - Origin: {}, User-Agent: {}, User: {}", origin, userAgent, request.getUsername());
        if (databaseSettingsService.isBootstrapMode()) {
            if (!"admin".equals(request.getUsername()) || !"password".equals(request.getPassword())) {
                throw new BadCredentialsException("Invalid credentials");
            }
            UserDetails bootstrapAdmin = User.withUsername("admin")
                    .password("")
                    .roles("ADMIN")
                    .build();
            String token = jwtService.generateToken(Map.of("bootstrap", true), bootstrapAdmin);
            return ResponseEntity.ok(LoginResponse.builder()
                    .token(token)
                    .username("admin")
                    .role("ADMIN")
                    .mustChangePassword(false)
                    .bootstrapMode(true)
                    .build());
        }
        try {
            LoginResponse response = userService.login(request);
            log.info("Login successful for user: {}", request.getUsername());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Login failed for user: {} - Error: {}", request.getUsername(), e.getMessage());
            throw e;
        }
    }

    @GetMapping("/bootstrap-status")
    public ResponseEntity<Map<String, Boolean>> bootstrapStatus() {
        return ResponseEntity.ok(Map.of("bootstrapMode", databaseSettingsService.isBootstrapMode()));
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(Authentication authentication) {
        if (authentication != null) {
            userService.logout(authentication.getName());
        }
        return ResponseEntity.ok(Map.of("message", "Logged out"));
    }

    @PostMapping("/change-password")
    public ResponseEntity<Map<String, String>> changePassword(
            Authentication authentication,
            @Valid @RequestBody ChangePasswordRequest request) {
        userService.changePassword(authentication.getName(), request);
        return ResponseEntity.ok(Map.of("message", "Password changed successfully. Please login again."));
    }

    @GetMapping("/ping")
    public ResponseEntity<Map<String, String>> ping(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        String userAgent = request.getHeader("User-Agent");
        log.info("Ping from - Origin: {}, User-Agent: {}", origin, userAgent);
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "message", "Backend is reachable",
                "origin", origin != null ? origin : "null",
                "timestamp", java.time.Instant.now().toString()
        ));
    }
}
