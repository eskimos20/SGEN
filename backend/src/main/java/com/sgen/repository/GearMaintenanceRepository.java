package com.sgen.repository;

import com.sgen.entity.GearMaintenance;
import com.sgen.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GearMaintenanceRepository extends JpaRepository<GearMaintenance, Long> {
    
    List<GearMaintenance> findByUserAndGearIdOrderByServiceDateDesc(User user, String gearId);
    
    List<GearMaintenance> findByUserOrderByServiceDateDesc(User user);
    
    List<GearMaintenance> findByGearId(String gearId);
    
    void deleteByIdAndUser(Long id, User user);
    
    void deleteByUser(User user);
}
