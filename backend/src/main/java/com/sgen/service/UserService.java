package com.sgen.service;

import com.sgen.dto.*;
import com.sgen.entity.User;
import com.sgen.exception.NotFoundException;
import com.sgen.repository.*;
import com.sgen.security.JwtService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final IntervalsClientFactory intervalsClientFactory;
    private final WeatherForecastRepository weatherForecastRepository;
    private final WeatherLocationRepository weatherLocationRepository;
    private final FtpResultRepository ftpResultRepository;
    private final Vo2MaxResultRepository vo2MaxResultRepository;
    private final UserAchievementRepository userAchievementRepository;
    private final GearMaintenanceRepository gearMaintenanceRepository;
    private final BikeFitSettingsRepository bikeFitSettingsRepository;
    private final BikeFitAnalysisRepository bikeFitAnalysisRepository;
    private final AIUsageLogRepository aiUsageLogRepository;
    private final UserVersionRepository userVersionRepository;

    @Value("${jwt.expiration:3600000}")
    private long webExpiration;

    @Value("${jwt.mobile-expiration:31536000000}")
    private long mobileExpiration;


    @Transactional
    public LoginResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
        );

        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new NotFoundException("User not found"));

        user.setLastLogin(java.time.LocalDateTime.now());
        user.setLastActivity(user.getLastLogin());
        userRepository.save(user);

        UserDetails userDetails = new org.springframework.security.core.userdetails.User(
                user.getUsername(),
                user.getPassword(),
                java.util.Collections.singletonList(
                        new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + user.getRole().name())
                )
        );

        // Use different expiration based on client type
        boolean isMobile = "mobile".equalsIgnoreCase(request.getClientType());
        long expiration = isMobile ? mobileExpiration : webExpiration;
        String token = jwtService.generateTokenWithExpiration(userDetails, expiration);

        log.info("Login successful for user: {} (client: {}, expiration: {} ms)",
                request.getUsername(), isMobile ? "mobile" : "web", expiration);

        return LoginResponse.builder()
                .token(token)
                .username(user.getUsername())
                .role(user.getRole().name())
                .mustChangePassword(user.isMustChangePassword())
                .build();
    }

    @Transactional
    public void logout(String username) {
        User user = userRepository.findByUsername(username).orElse(null);
        if (user != null) {
            user.setLastActivity(null);
            userRepository.save(user);
        }
    }

    @Transactional
    public void changePassword(String username, ChangePasswordRequest request) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new NotFoundException("User not found"));

        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new RuntimeException("Current password is incorrect");
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        user.setMustChangePassword(false);
        userRepository.save(user);
    }

    @Transactional
    public UserResponse createUser(CreateUserRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new RuntimeException("Username already exists");
        }

        User user = User.builder()
                .username(request.getUsername())
                .password(passwordEncoder.encode("password"))
                .role(User.Role.USER)
                .mustChangePassword(true)
                .build();

        user = userRepository.save(user);
        return mapToUserResponse(user);
    }

    @Transactional
    public void deleteUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        if (user.getRole() == User.Role.ADMIN) {
            throw new RuntimeException("Cannot delete admin user");
        }

        // Delete all related data from OUR database only (not from Intervals.icu)
        weatherForecastRepository.deleteByUser(user);
        weatherLocationRepository.deleteByUser(user);
        ftpResultRepository.deleteByUser(user);
        vo2MaxResultRepository.deleteByUser(user);
        userAchievementRepository.deleteByUser(user);
        gearMaintenanceRepository.deleteByUser(user);
        bikeFitSettingsRepository.deleteByUserId(user.getId());
        bikeFitAnalysisRepository.deleteByUserId(user.getId());
        aiUsageLogRepository.deleteByUsername(user.getUsername());
        userVersionRepository.deleteByUsername(user.getUsername());

        // Finally delete the user
        userRepository.delete(user);
    }

    public List<UserResponse> getAllUsers() {
        return userRepository.findByRole(User.Role.USER).stream()
                .map(this::mapToUserResponse)
                .collect(Collectors.toList());
    }

    public UserResponse getCurrentUser(String username, String redirectUri) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new NotFoundException("User not found"));
        return mapToUserResponse(user, redirectUri);
    }

    public UserResponse getCurrentUser(String username) {
        return getCurrentUser(username, null);
    }

    @Transactional
    public void updateUserProfile(String username, UserProfileRequest request) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new NotFoundException("User not found"));

        if (request.getIntervalsApiKey() != null) {
            intervalsClientFactory.evict(user.getIntervalsApiKey());
            user.setIntervalsApiKey(request.getIntervalsApiKey());
        }
        if (request.getIntervalsAthleteId() != null) {
            user.setIntervalsAthleteId(request.getIntervalsAthleteId());
        }
        // OpenAI configuration
        if (request.getOpenaiApiKey() != null) {
            user.setOpenaiApiKey(request.getOpenaiApiKey());
        }
        if (request.getOpenaiEnabled() != null) {
            user.setOpenaiEnabled(request.getOpenaiEnabled());
        }
        if (request.getOpenaiModel() != null) {
            user.setOpenaiModel(request.getOpenaiModel());
        }
        if (request.getOpenaiConnectionTested() != null) {
            user.setOpenaiConnectionTested(request.getOpenaiConnectionTested());
        }
        if (request.getShareWorkoutsEnabled() != null) {
            user.setShareWorkoutsEnabled(request.getShareWorkoutsEnabled());
        }
        // Zwift configuration
        if (request.getZwiftEnabled() != null) {
            user.setZwiftEnabled(request.getZwiftEnabled());
        }
        if (request.getZwiftUsername() != null) {
            user.setZwiftUsername(request.getZwiftUsername());
            user.setZwiftPlayerId(null);
        }
        if (request.getZwiftPassword() != null) {
            user.setZwiftPassword(request.getZwiftPassword());
        }
        userRepository.save(user);
    }

    public User getUserEntityByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new NotFoundException("User not found"));
    }

    @Transactional
    public void saveUser(User user) {
        userRepository.save(user);
    }

    private UserResponse mapToUserResponse(User user) {
        return mapToUserResponse(user, null);
    }

    private UserResponse mapToUserResponse(User user, String redirectUri) {
        return UserResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .role(user.getRole().name())
                .mustChangePassword(user.isMustChangePassword())
                .hasIntervalsConfig(user.getIntervalsApiKey() != null && user.getIntervalsAthleteId() != null)
                .intervalsAthleteId(user.getIntervalsAthleteId())
                // OpenAI configuration
                .hasOpenAIConfig(user.getOpenaiApiKey() != null && user.getOpenaiEnabled() != null && user.getOpenaiEnabled()
                        && user.getOpenaiConnectionTested() != null && user.getOpenaiConnectionTested())
                .openaiEnabled(user.getOpenaiEnabled())
                .openaiModel(user.getOpenaiModel())
                .openaiConnectionTested(user.getOpenaiConnectionTested())
                .shareWorkoutsEnabled(user.getShareWorkoutsEnabled())
                // Zwift configuration
                .zwiftEnabled(user.getZwiftEnabled())
                .hasZwiftConfig(user.getZwiftUsername() != null && user.getZwiftPassword() != null)
                .zwiftUsername(user.getZwiftUsername())
                .createdAt(user.getCreatedAt())
                .lastLogin(user.getLastLogin())
                .lastActivity(user.getLastActivity())
                .build();
    }

}
