package com.sgen.controller;

import com.sgen.entity.GarminConnection;
import com.sgen.entity.User;
import com.sgen.repository.GarminConnectionRepository;
import com.sgen.service.UserService;
import com.sgen.service.garmin.GarminDataCleanupService;
import com.sgen.service.garmin.GarminOAuthService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.view.RedirectView;

import java.util.HashMap;
import java.util.Map;

/**
 * Garmin connection lifecycle: status, authorize URL, OAuth callback,
 * disconnect. Mirrors the Strava flow shape (popup + callback html page).
 */
@Controller
@RequestMapping("/api/garmin")
@RequiredArgsConstructor
@Slf4j
public class GarminConnectionController {

    private final GarminOAuthService oauthService;
    private final GarminConnectionRepository connectionRepository;
    private final GarminDataCleanupService cleanupService;
    private final UserService userService;

    @Value("${app.frontend.url:http://localhost:8081}")
    private String frontendUrl;

    @GetMapping("/status")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> status(Authentication auth) {
        Map<String, Object> out = new HashMap<>();
        User user = userService.getUserEntityByUsername(auth.getName());
        connectionRepository.findByUserId(user.getId()).ifPresentOrElse(conn -> {
            out.put("connected", "ACTIVE".equals(conn.getStatus()));
            out.put("status", conn.getStatus());
            out.put("garminUserId", conn.getGarminUserId());
            out.put("scopes", conn.getScopes());
            out.put("tokenExpiresAt", conn.getTokenExpiresAt());
            out.put("consentAiProcessing", conn.getConsentAiProcessing());
        }, () -> {
            out.put("connected", false);
            out.put("status", "NONE");
        });
        out.put("oauthConfigured", oauthService.isConfigured());
        return ResponseEntity.ok(out);
    }

    @PostMapping("/connect-url")
    @ResponseBody
    public ResponseEntity<Map<String, String>> connectUrl(Authentication auth) {
        if (!oauthService.isConfigured()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Garmin OAuth not configured"));
        }
        User user = userService.getUserEntityByUsername(auth.getName());
        return ResponseEntity.ok(Map.of("url", oauthService.buildAuthorizeUrl(user.getId())));
    }

    @PostMapping("/ai-consent")
    @ResponseBody
    public ResponseEntity<Void> aiConsent(Authentication auth, @RequestBody Map<String, Boolean> body) {
        User user = userService.getUserEntityByUsername(auth.getName());
        connectionRepository.findByUserId(user.getId()).ifPresent(conn -> {
            conn.setConsentAiProcessing(Boolean.TRUE.equals(body.get("consent")));
            connectionRepository.save(conn);
        });
        return ResponseEntity.ok().build();
    }

    /** OAuth2 redirect target — permitAll, redirects to callback html page. */
    @GetMapping("/callback")
    public RedirectView callback(@RequestParam(required = false) String code,
                                 @RequestParam(required = false) String state,
                                 @RequestParam(required = false) String error,
                                 @RequestParam(required = false) String error_description) {
        StringBuilder url = new StringBuilder(frontendUrl).append("/garmin-callback.html");
        if (error != null) {
            url.append("?error=").append(error);
            if (error_description != null) url.append("&error_description=").append(error_description);
        } else if (code == null) {
            url.append("?error=missing_code");
        } else {
            String err = oauthService.exchangeCode(code, state);
            url.append(err != null ? "?error=" + err : "?success=true");
        }
        return new RedirectView(url.toString());
    }

    @DeleteMapping("/disconnect")
    @ResponseBody
    public ResponseEntity<Void> disconnect(Authentication auth) {
        User user = userService.getUserEntityByUsername(auth.getName());
        oauthService.disconnect(user.getId());
        cleanupService.deleteAllGarminData(user.getId());
        return ResponseEntity.ok().build();
    }
}
