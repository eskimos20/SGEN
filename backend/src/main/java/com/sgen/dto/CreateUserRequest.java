package com.sgen.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateUserRequest {
    
    @NotBlank(message = "Username is required")
    private String username;
}
