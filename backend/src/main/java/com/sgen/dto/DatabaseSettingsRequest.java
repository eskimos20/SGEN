package com.sgen.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record DatabaseSettingsRequest(
        @NotBlank @Size(max = 255) String host,
        @NotNull @Min(1) @Max(65535) Integer port,
        @NotBlank @Size(max = 64) @Pattern(regexp = "[A-Za-z0-9_]+") String databaseName,
        @NotBlank @Size(max = 128) String username,
        @Size(max = 512) String password
) {
}
