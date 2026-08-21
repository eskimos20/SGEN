package com.sgen.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/version")
@PreAuthorize("hasRole('USER')")
public class VersionController {

    private static final long SERVER_START_TIME = System.currentTimeMillis();

    @Value("${app.version:unknown}")
    private String appVersion;

    @GetMapping
    public Map<String, Object> getVersion() {
        return Map.of(
            "version", appVersion,
            "serverStartTime", SERVER_START_TIME
        );
    }
}
