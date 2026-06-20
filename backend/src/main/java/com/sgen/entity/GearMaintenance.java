package com.sgen.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Entity
@Table(name = "gear_maintenance")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class GearMaintenance {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    
    @Column(name = "gear_id", nullable = false)
    private String gearId; // Intervals.icu gear ID
    
    @Column(name = "gear_name")
    private String gearName; // Cache gear name for display
    
    @Column(name = "service_date", nullable = false)
    private LocalDate serviceDate;
    
    @Column(name = "distance_at_service")
    private Integer distanceAtService; // Distance in meters when service was performed
    
    @Column(name = "service_type", nullable = false)
    private String serviceType; // e.g., "Chain replacement", "Brake pads", "Full service"
    
    @Column(name = "description", length = 1000)
    private String description; // Detailed notes about the service
    
    @Column(name = "cost")
    private Double cost; // Optional cost tracking
    
    @Column(name = "performed_by")
    private String performedBy; // e.g., "Self", "Bike shop name"
    
    @Column(name = "created_at", nullable = false)
    private LocalDate createdAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDate.now();
    }
}
