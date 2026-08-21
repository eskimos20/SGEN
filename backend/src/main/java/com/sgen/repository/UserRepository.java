package com.sgen.repository;

import com.sgen.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    boolean existsByUsername(String username);

    List<User> findByRole(User.Role role);

    List<User> findByShareWorkoutsEnabledTrue();

    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.lastActivity = :lastActivity WHERE u.username = :username")
    void updateLastActivityByUsername(@Param("username") String username, @Param("lastActivity") LocalDateTime lastActivity);
}
