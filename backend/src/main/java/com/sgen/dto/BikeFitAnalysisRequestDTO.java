package com.sgen.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BikeFitAnalysisRequestDTO {
    private Map<String, Number> angles;
    private String ridingStyle;
}
