package com.sgen.controller;

import com.sgen.dto.ChangePasswordRequest;
import com.sgen.dto.LoginRequest;
import com.sgen.dto.LoginResponse;
import com.sgen.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final UserService userService;

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        String origin = httpRequest.getHeader("Origin");
        String userAgent = httpRequest.getHeader("User-Agent");
        log.info("Login attempt - Origin: {}, User-Agent: {}, User: {}", origin, userAgent, request.getUsername());
        try {
            LoginResponse response = userService.login(request);
            log.info("Login successful for user: {}", request.getUsername());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Login failed for user: {} - Error: {}", request.getUsername(), e.getMessage());
            throw e;
        }
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
