package com.sgen.dto;

import lombok.Data;

@Data
public class UserProfileRequest {

    private String intervalsApiKey;

    private String intervalsAthleteId;

    // OpenAI user-level configuration
    private String openaiApiKey;

    private Boolean openaiEnabled;

    private String openaiModel;

    private Boolean openaiConnectionTested;


    private Boolean shareWorkoutsEnabled;

    // Zwift configuration
    private Boolean zwiftEnabled;
    private String zwiftUsername;
    private String zwiftPassword;
}
