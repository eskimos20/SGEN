package com.sgen.config;

import com.sgen.entity.User;
import com.sgen.repository.UserRepository;
import com.sgen.service.DatabaseSettingsService;
import com.sgen.service.PerformanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final PerformanceService performanceService;
    private final DatabaseSettingsService databaseSettingsService;

    @Override
    public void run(String... args) {
        if (databaseSettingsService.isBootstrapMode()) {
            log.info("MySQL is not configured. Skipping database-backed initialization in admin setup mode.");
            return;
        }
        if (!userRepository.existsByUsername("admin")) {
            User admin = User.builder()
                    .username("admin")
                    .password(passwordEncoder.encode("password"))
                    .role(User.Role.ADMIN)
                    .mustChangePassword(true)
                    .build();
            
            userRepository.save(admin);
            log.info("Default admin user created with an initial password that must be changed.");
        }

        try {
            performanceService.mergeTop3Lists();
        } catch (Exception e) {
            log.error("Failed to merge top-3 lists: {}", e.getMessage(), e);
        }
    }
}
