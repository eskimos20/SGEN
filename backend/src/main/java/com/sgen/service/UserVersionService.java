package com.sgen.service;

import com.sgen.entity.UserVersion;
import com.sgen.repository.UserVersionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserVersionService {

    private final UserVersionRepository userVersionRepository;

    /**
     * Check if user has seen a specific version
     */
    public boolean hasUserSeenVersion(String username, String version) {
        Optional<UserVersion> userVersion = userVersionRepository.findByUsernameAndVersion(username, version);
        return userVersion.isPresent();
    }

    /**
     * Mark a version as seen by the user
     */
    @Transactional
    public UserVersion markVersionAsSeen(String username, String version) {
        // Check if user has already seen this exact version
        if (userVersionRepository.existsByUsernameAndVersion(username, version)) {
            return null; // Same version already seen, don't log
        }
        
        // Create new entry for this version
        UserVersion userVersion = new UserVersion();
        userVersion.setUsername(username);
        userVersion.setVersion(version);
        
        return userVersionRepository.save(userVersion);
    }

    /**
     * Get the latest version seen by the user
     */
    public Optional<UserVersion> getLatestSeenVersion(String username) {
        return userVersionRepository.findTopByUsernameOrderBySeenAtDesc(username);
    }
}
