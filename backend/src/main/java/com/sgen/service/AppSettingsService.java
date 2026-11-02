package com.sgen.service;

import com.sgen.entity.AppSettings;
import com.sgen.repository.AppSettingsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AppSettingsService {

    private final AppSettingsRepository appSettingsRepository;

    public boolean isDumpActivityStreamsEnabled() {
        return appSettingsRepository.findById(1L)
                .map(AppSettings::isDumpActivityStreams)
                .orElse(false);
    }

    @Transactional
    public void setDumpActivityStreams(boolean enabled) {
        AppSettings settings = appSettingsRepository.findById(1L)
                .orElseGet(() -> AppSettings.builder().build());
        
        settings.setDumpActivityStreams(enabled);
        appSettingsRepository.save(settings);
        
        log.info("Activity stream dump {}", enabled ? "enabled" : "disabled");
    }

    public String getGarminClientId() {
        return appSettingsRepository.findById(1L)
                .map(AppSettings::getGarminClientId).orElse(null);
    }

    public String getGarminClientSecret() {
        return appSettingsRepository.findById(1L)
                .map(AppSettings::getGarminClientSecret).orElse(null);
    }

    public String getGarminRedirectUri() {
        return appSettingsRepository.findById(1L)
                .map(AppSettings::getGarminRedirectUri).orElse(null);
    }

    @Transactional
    public void setGarminCredentials(String clientId, String clientSecret, String redirectUri) {
        AppSettings settings = appSettingsRepository.findById(1L)
                .orElseGet(() -> AppSettings.builder().build());
        if (clientId != null) settings.setGarminClientId(clientId);
        if (clientSecret != null) settings.setGarminClientSecret(clientSecret);
        if (redirectUri != null) settings.setGarminRedirectUri(redirectUri);
        appSettingsRepository.save(settings);
        log.info("Garmin OAuth credentials updated via admin panel");
    }
}
