package com.sgen.service;

import com.sgen.entity.User;
import com.sgen.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Lightweight user lookup shared by services that only need to resolve a
 * user id to a username (for logging and display). Kept deliberately thin so
 * it can be injected anywhere without pulling in auth-related beans.
 */
@Service
@RequiredArgsConstructor
public class UserLookupService {

    private final UserRepository userRepository;

    /** Username for a user id, or the numeric id as string when not found. */
    public String usernameOf(Long userId) {
        return userRepository.findById(userId).map(User::getUsername).orElse(String.valueOf(userId));
    }
}
