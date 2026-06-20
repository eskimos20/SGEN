package com.sgen.repository;

import com.sgen.entity.CalendarEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface CalendarEventRepository extends JpaRepository<CalendarEvent, Long> {
    
    /**
     * Find a calendar event by intervals event ID and username
     */
    Optional<CalendarEvent> findByIntervalsEventIdAndUsername(Integer intervalsEventId, String username);
    
    /**
     * Find all calendar events for a user within a date range
     */
    @Query("SELECT ce FROM CalendarEvent ce WHERE ce.username = :username AND ce.eventDate BETWEEN :startDate AND :endDate ORDER BY ce.eventDate")
    List<CalendarEvent> findByUsernameAndEventDateBetween(@Param("username") String username, 
                                                         @Param("startDate") LocalDate startDate, 
                                                         @Param("endDate") LocalDate endDate);
    
    /**
     * Find all calendar events for a user
     */
    List<CalendarEvent> findByUsernameOrderByEventDate(String username);
    
    /**
     * Delete a calendar event by intervals event ID and username
     */
    void deleteByIntervalsEventIdAndUsername(Integer intervalsEventId, String username);
    
    /**
     * Check if a calendar event exists for the given intervals event ID and username
     */
    boolean existsByIntervalsEventIdAndUsername(Integer intervalsEventId, String username);
    
    /**
     * Find all deload week events for a user within a date range
     */
    @Query("SELECT ce FROM CalendarEvent ce WHERE ce.username = :username AND ce.eventDate BETWEEN :startDate AND :endDate AND ce.isDeloadWeek = true ORDER BY ce.eventDate")
    List<CalendarEvent> findDeloadWeekEventsByUsernameAndDateRange(@Param("username") String username,
                                                                @Param("startDate") LocalDate startDate,
                                                                @Param("endDate") LocalDate endDate);
}
