package com.sgen.repository;

import com.sgen.entity.UserVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserVersionRepository extends JpaRepository<UserVersion, Long> {
    
    Optional<UserVersion> findByUsernameAndVersion(String username, String version);
    
    boolean existsByUsernameAndVersion(String username, String version);
    
    void deleteByUsernameAndVersion(String username, String version);
    
    Optional<UserVersion> findTopByUsernameOrderBySeenAtDesc(String username);
    
    void deleteByUsername(String username);
}
