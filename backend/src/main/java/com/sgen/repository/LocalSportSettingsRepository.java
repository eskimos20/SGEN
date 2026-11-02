package com.sgen.repository;

import com.sgen.entity.LocalSportSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface LocalSportSettingsRepository extends JpaRepository<LocalSportSettings, Long> {
    List<LocalSportSettings> findByUserId(Long userId);
    Optional<LocalSportSettings> findByUserIdAndSportKey(Long userId, String sportKey);
}
