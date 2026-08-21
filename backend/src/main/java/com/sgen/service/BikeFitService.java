package com.sgen.service;

import com.sgen.dto.BikeFitSettingsDTO;
import com.sgen.entity.BikeFitSettings;
import com.sgen.entity.User;
import com.sgen.repository.BikeFitSettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class BikeFitService {

    private final BikeFitSettingsRepository bikeFitSettingsRepository;
    private final UserService userService;

    public BikeFitSettingsDTO getSettings(String username) {
        User user = userService.getUserEntityByUsername(username);

        BikeFitSettings settings = bikeFitSettingsRepository.findByUserId(user.getId())
                .orElse(null);

        if (settings == null) {
            return BikeFitSettingsDTO.builder()
                    .cameraPermissionGranted(false)
                    .build();
        }

        return BikeFitSettingsDTO.builder()
                .id(settings.getId())
                .cameraDeviceId(settings.getCameraDeviceId())
                .cameraLabel(settings.getCameraLabel())
                .cameraPermissionGranted(settings.getCameraPermissionGranted())
                .build();
    }

    public BikeFitSettingsDTO saveSettings(String username, BikeFitSettingsDTO settingsDTO) {
        User user = userService.getUserEntityByUsername(username);

        BikeFitSettings settings = bikeFitSettingsRepository.findByUserId(user.getId())
                .orElse(BikeFitSettings.builder()
                        .userId(user.getId())
                        .build());

        settings.setCameraDeviceId(settingsDTO.getCameraDeviceId());
        settings.setCameraLabel(settingsDTO.getCameraLabel());
        settings.setCameraPermissionGranted(settingsDTO.getCameraPermissionGranted());

        settings = bikeFitSettingsRepository.save(settings);

        return BikeFitSettingsDTO.builder()
                .id(settings.getId())
                .cameraDeviceId(settings.getCameraDeviceId())
                .cameraLabel(settings.getCameraLabel())
                .cameraPermissionGranted(settings.getCameraPermissionGranted())
                .build();
    }
}
