package com.sgen.controller;

import com.sgen.service.WorkoutShareService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/workout-shares")
@RequiredArgsConstructor
@PreAuthorize("hasRole('USER')")
@Slf4j
public class WorkoutShareController {

    private final WorkoutShareService workoutShareService;

    @GetMapping("/sharable-users")
    public ResponseEntity<?> getSharableUsers(Authentication authentication) {
        try {
            var users = workoutShareService.findSharableUsers().stream()
                    .filter(u -> !u.getUsername().equals(authentication.getName()))
                    .map(u -> Map.of(
                            "id", u.getId(),
                            "username", u.getUsername()
                    ))
                    .toList();
            return ResponseEntity.ok(Map.of("users", users));
        } catch (Exception e) {
            log.error("Failed to get sharable users: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping
    public ResponseEntity<?> shareWorkout(
            Authentication authentication,
            @RequestBody WorkoutShareService.ShareRequest request) {
        try {
            var shares = workoutShareService.shareWorkout(authentication.getName(), request);
            return ResponseEntity.ok(Map.of(
                    "message", "Workout shared successfully",
                    "shares", shares.stream().map(s -> Map.of(
                            "id", s.getId(),
                            "toUsername", s.getToUsername(),
                            "status", s.getStatus().name()
                    )).toList()
            ));
        } catch (Exception e) {
            log.error("Failed to share workout for {}: {}", authentication.getName(), e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/pending")
    public ResponseEntity<?> getPendingShares(Authentication authentication) {
        try {
            var shares = workoutShareService.getPendingShares(authentication.getName());
            return ResponseEntity.ok(Map.of("shares", shares));
        } catch (Exception e) {
            log.error("Failed to get pending shares for {}: {}", authentication.getName(), e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/accept")
    public ResponseEntity<?> acceptShare(
            @PathVariable Long id,
            Authentication authentication) {
        try {
            var share = workoutShareService.acceptShare(id, authentication.getName());
            return ResponseEntity.ok(Map.of(
                    "message", "Workout accepted",
                    "share", Map.of(
                            "id", share.getId(),
                            "workoutName", share.getWorkoutName(),
                            "status", share.getStatus().name()
                    )
            ));
        } catch (Exception e) {
            log.error("Failed to accept share {} for {}: {}", id, authentication.getName(), e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/decline")
    public ResponseEntity<?> declineShare(
            @PathVariable Long id,
            Authentication authentication) {
        try {
            var share = workoutShareService.declineShare(id, authentication.getName());
            return ResponseEntity.ok(Map.of(
                    "message", "Workout declined",
                    "share", Map.of(
                            "id", share.getId(),
                            "workoutName", share.getWorkoutName(),
                            "status", share.getStatus().name()
                    )
            ));
        } catch (Exception e) {
            log.error("Failed to decline share {} for {}: {}", id, authentication.getName(), e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
