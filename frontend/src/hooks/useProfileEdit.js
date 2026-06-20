import { useState } from 'react';
import { 
  updateAthleteProfile, 
  updateAthleteSettings, 
  updateAthleteSportSettings, 
  updateWellnessData 
} from '../utils/fitnessService';

export const useProfileEdit = (athleteProfile, onProfileUpdate) => {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({});

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const profileUpdates = {};
      const sportSettingsUpdates = {};

      // Basic profile data
      const parsedWeight = parseFloat(editForm.weight);
      const parsedHeight = parseFloat(editForm.height);
      const parsedRestingHr = parseInt(editForm.restingHr);
      if (!isNaN(parsedWeight)) profileUpdates.weight = parsedWeight;
      if (!isNaN(parsedHeight)) profileUpdates.height = parsedHeight;
      if (!isNaN(parsedRestingHr)) profileUpdates.icu_resting_hr = parsedRestingHr;
      
      const wellnessUpdates = [];

      // Sport-specific settings
      if (editForm.sportId) {
        const sportUpdate = {};
        
        // Handle FTP add/remove
        if (editForm.supportsPower) {
          if (editForm.sportFtp !== '') {
            sportUpdate.ftp = parseInt(editForm.sportFtp);
            sportUpdate.indoor_ftp = parseInt(editForm.sportFtp);
          }
        } else if (editForm.originalSupportsPower) {
          sportUpdate.ftp = 0;
          sportUpdate.indoor_ftp = 0;
        }
        if (editForm.sportLthr !== '') sportUpdate.lthr = parseInt(editForm.sportLthr);
        if (editForm.sportMaxHr !== '') sportUpdate.max_hr = parseInt(editForm.sportMaxHr);
        
        // Handle HR zones
        if (editForm.sportHrZones && editForm.sportHrZones.length > 0) {
          sportUpdate.hr_zones = editForm.sportHrZones;
        }
        
        // Handle power zones
        if (editForm.sportPowerZones && editForm.sportPowerZones.length > 0) {
          sportUpdate.power_zones = editForm.sportPowerZones;
        }
        
        // Handle activity types changes
        if (editForm.sportTypes && editForm.sportTypes.length > 0) {
          const sportSettings = athleteProfile.sportSettings || [];
          const currentSport = sportSettings.find(s => s.id === editForm.sportId);
          const currentTypes = currentSport?.types || [];
          const typesChanged = JSON.stringify([...currentTypes].sort()) !== JSON.stringify([...editForm.sportTypes].sort());
          if (typesChanged) {
            sportUpdate.types = editForm.sportTypes;
          }
        }
        
        sportUpdate.id = editForm.sportId;
        if (editForm.sportTypes && editForm.sportTypes.length > 0) {
          sportUpdate.type = editForm.sportTypes[0];
        }
        if (Object.keys(sportUpdate).length > 1) {
          sportSettingsUpdates[editForm.sportId] = sportUpdate;
        }
      }

      // Make API calls
      const promises = [];
      if (Object.keys(profileUpdates).length > 0) {
        promises.push(updateAthleteProfile(profileUpdates));
      }
      if (wellnessUpdates.length > 0) {
        promises.push(updateWellnessData(wellnessUpdates));
      }
      if (Object.keys(sportSettingsUpdates).length > 0) {
        Object.values(sportSettingsUpdates).forEach(sportUpdate => {
          promises.push(updateAthleteSportSettings(sportUpdate));
        });
      }

      await Promise.all(promises);
      
      setIsEditModalOpen(false);
      if (onProfileUpdate) {
        onProfileUpdate();
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      alert('Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isEditModalOpen,
    setIsEditModalOpen,
    isSaving,
    editForm,
    setEditForm,
    handleSaveProfile
  };
};
