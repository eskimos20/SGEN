package com.sgen.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BikeFitSettingsDTO {
    private Long id;
    private String cameraDeviceId;
    private String cameraLabel;
    private Boolean cameraPermissionGranted;
}
