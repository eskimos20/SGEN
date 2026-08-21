package com.sgen.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Entity
@Table(name = "user_versions")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserVersion {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "username", nullable = false)
    private String username;
    
    @Column(name = "version", nullable = false)
    private String version;
    
    @Column(name = "seen_at", nullable = false)
    private java.time.LocalDateTime seenAt;
    
    @PrePersist
    protected void onCreate() {
        seenAt = java.time.LocalDateTime.now();
    }
}
