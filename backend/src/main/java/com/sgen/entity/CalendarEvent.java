package com.sgen.entity;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "calendar_events")
public class CalendarEvent {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "intervals_event_id", nullable = false, unique = true)
    private Integer intervalsEventId;
    
    @Column(name = "username", nullable = false)
    private String username;
    
    @Column(name = "event_date", nullable = false)
    private LocalDate eventDate;
    
    @Column(name = "event_name")
    private String eventName;
    
    @Column(name = "is_deload_week", nullable = false)
    private Boolean isDeloadWeek = false;
    
    @Column(name = "original_file_name")
    private String originalFileName;
    
    @Column(name = "created_at", nullable = false)
    private LocalDate createdAt;
    
    @Column(name = "updated_at")
    private LocalDate updatedAt;
    
    // Constructors
    public CalendarEvent() {
        this.createdAt = LocalDate.now();
        this.isDeloadWeek = false;
    }
    
    public CalendarEvent(Integer intervalsEventId, String username, LocalDate eventDate, String eventName, Boolean isDeloadWeek) {
        this.intervalsEventId = intervalsEventId;
        this.username = username;
        this.eventDate = eventDate;
        this.eventName = eventName;
        this.isDeloadWeek = isDeloadWeek != null ? isDeloadWeek : false;
        this.createdAt = LocalDate.now();
    }
    
    // Getters and Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public Integer getIntervalsEventId() {
        return intervalsEventId;
    }
    
    public void setIntervalsEventId(Integer intervalsEventId) {
        this.intervalsEventId = intervalsEventId;
    }
    
    public String getUsername() {
        return username;
    }
    
    public void setUsername(String username) {
        this.username = username;
    }
    
    public LocalDate getEventDate() {
        return eventDate;
    }
    
    public void setEventDate(LocalDate eventDate) {
        this.eventDate = eventDate;
    }
    
    public String getEventName() {
        return eventName;
    }
    
    public void setEventName(String eventName) {
        this.eventName = eventName;
    }
    
    public Boolean getIsDeloadWeek() {
        return isDeloadWeek;
    }
    
    public void setIsDeloadWeek(Boolean isDeloadWeek) {
        this.isDeloadWeek = isDeloadWeek != null ? isDeloadWeek : false;
        this.updatedAt = LocalDate.now();
    }
    
    public String getOriginalFileName() {
        return originalFileName;
    }
    
    public void setOriginalFileName(String originalFileName) {
        this.originalFileName = originalFileName;
    }
    
    public LocalDate getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDate createdAt) {
        this.createdAt = createdAt;
    }
    
    public LocalDate getUpdatedAt() {
        return updatedAt;
    }
    
    public void setUpdatedAt(LocalDate updatedAt) {
        this.updatedAt = updatedAt;
    }
    
    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDate.now();
    }
}
