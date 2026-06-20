package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_achievements")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserAchievement {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    
    @Column(nullable = false)
    private String achievementId; // "ftp_up", "lthr_up"
    
    @Column(nullable = false)
    private String activityId; // Intervals.icu activity ID
    
    @Column(nullable = false)
    private String activityName;
    
    @Column(nullable = false)
    private String sportType; // "Ride", "Run", etc.
    
    @Column(nullable = false)
    private LocalDate achievementDate;
    
    @Column(nullable = false)
    private String achievementType; // "FTP_UP", "LTHR_UP"
    
    // For FTP achievements
    private Integer newFtpValue;
    private Integer oldFtpValue;
    private Integer effortWatts;
    private Integer effortSeconds;
    
    // For LTHR achievements
    private Integer newLthrValue;
    private Integer oldLthrValue;
    
    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private AchievementStatus status; // PENDING, ACCEPTED, DISMISSED
    
    @Column(nullable = false)
    private LocalDateTime createdAt;
    
    private LocalDateTime respondedAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
    
    public enum AchievementStatus {
        PENDING,
        ACCEPTED,
        DISMISSED
    }
}
