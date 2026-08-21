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
}
