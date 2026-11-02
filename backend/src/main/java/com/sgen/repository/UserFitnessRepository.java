package com.sgen.repository;

import com.sgen.entity.UserFitness;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserFitnessRepository extends JpaRepository<UserFitness, Long> {
    Optional<UserFitness> findByUserIdAndFitnessDate(Long userId, LocalDate fitnessDate);
    List<UserFitness> findByUserIdAndFitnessDateBetweenOrderByFitnessDateAsc(Long userId, LocalDate from, LocalDate to);
    Optional<UserFitness> findTopByUserIdOrderByFitnessDateDesc(Long userId);
    Optional<UserFitness> findTopByUserIdAndFitnessDateBeforeOrderByFitnessDateDesc(Long userId, LocalDate before);
    void deleteByUserId(Long userId);
}
