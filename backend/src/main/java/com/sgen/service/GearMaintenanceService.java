package com.sgen.service;

import com.sgen.entity.GearMaintenance;
import com.sgen.entity.User;
import com.sgen.exception.ForbiddenException;
import com.sgen.repository.GearMaintenanceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class GearMaintenanceService {
    
    private final GearMaintenanceRepository maintenanceRepository;
    private final UserService userService;
    
    @Transactional
    public GearMaintenance createMaintenance(String username, GearMaintenance maintenance) {
        User user = userService.getUserEntityByUsername(username);
        maintenance.setUser(user);
        log.info("Creating maintenance record for user {} and gear {}", username, maintenance.getGearId());
        return maintenanceRepository.save(maintenance);
    }
    
    @Transactional(readOnly = true)
    public List<GearMaintenance> getMaintenanceForGear(String username, String gearId) {
        User user = userService.getUserEntityByUsername(username);
        return maintenanceRepository.findByUserAndGearIdOrderByServiceDateDesc(user, gearId);
    }
    
    @Transactional(readOnly = true)
    public List<GearMaintenance> getAllMaintenance(String username) {
        User user = userService.getUserEntityByUsername(username);
        return maintenanceRepository.findByUserOrderByServiceDateDesc(user);
    }
    
    @Transactional
    public GearMaintenance updateMaintenance(String username, Long id, GearMaintenance updatedMaintenance) {
        if (id == null) {
            throw new RuntimeException("Maintenance ID cannot be null");
        }
        User user = userService.getUserEntityByUsername(username);
        GearMaintenance existing = maintenanceRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Maintenance record not found"));
        
        if (!existing.getUser().getId().equals(user.getId())) {
            throw new ForbiddenException("Access denied to maintenance record " + id);
        }
        
        existing.setServiceDate(updatedMaintenance.getServiceDate());
        existing.setDistanceAtService(updatedMaintenance.getDistanceAtService());
        existing.setServiceType(updatedMaintenance.getServiceType());
        existing.setDescription(updatedMaintenance.getDescription());
        existing.setCost(updatedMaintenance.getCost());
        existing.setPerformedBy(updatedMaintenance.getPerformedBy());
        
        log.info("Updating maintenance record {} for user {}", id, username);
        return maintenanceRepository.save(existing);
    }
    
    @Transactional
    public void deleteMaintenance(String username, Long id) {
        if (id == null) {
            throw new RuntimeException("Maintenance ID cannot be null");
        }
        User user = userService.getUserEntityByUsername(username);
        GearMaintenance maintenance = maintenanceRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Maintenance record not found"));
        
        if (!maintenance.getUser().getId().equals(user.getId())) {
            throw new ForbiddenException("Access denied to maintenance record " + id);
        }
        
        log.info("Deleting maintenance record {} for user {}", id, username);
        maintenanceRepository.delete(maintenance);
    }
    
    @Transactional
    public void deleteByGearId(String gearId) {
        List<GearMaintenance> maintenanceRecords = maintenanceRepository.findByGearId(gearId);
        if (!maintenanceRecords.isEmpty()) {
            log.info("Deleting {} maintenance records for gear {}", maintenanceRecords.size(), gearId);
            maintenanceRepository.deleteAll(maintenanceRecords);
        }
    }
}
