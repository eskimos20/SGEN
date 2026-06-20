import { useState } from 'react';
import { 
  createAthleteSportSettings, 
  deleteAthleteSportSettings, 
  fetchAvailableActivityTypes, 
  fetchMatchingActivities, 
  applySettingsToActivities 
} from '../utils/fitnessService';

export const useAthleteSports = (onProfileUpdate) => {
  const [isAddSportModalOpen, setIsAddSportModalOpen] = useState(false);
  const [availableActivityTypes, setAvailableActivityTypes] = useState([]);
  const [loadingActivityTypes, setLoadingActivityTypes] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [addSportSearch, setAddSportSearch] = useState('');
  const [isCreatingSport, setIsCreatingSport] = useState(false);
  const [deletingSportId, setDeletingSportId] = useState(null);
  const [updateActivitiesState, setUpdateActivitiesState] = useState({});

  const handleOpenAddSport = async () => {
    setIsAddSportModalOpen(true);
    setSelectedTypes([]);
    setAddSportSearch('');
    setLoadingActivityTypes(true);
    try {
      const types = await fetchAvailableActivityTypes();
      setAvailableActivityTypes(types);
    } catch (error) {
      console.error('Failed to fetch activity types:', error);
    } finally {
      setLoadingActivityTypes(false);
    }
  };

  const handleCreateSport = async () => {
    if (selectedTypes.length === 0) return;
    setIsCreatingSport(true);
    try {
      await createAthleteSportSettings({ types: selectedTypes });
      setIsAddSportModalOpen(false);
      if (onProfileUpdate) {
        onProfileUpdate();
      }
    } catch (error) {
      console.error('Failed to create sport:', error);
      // Error will be shown in console, user can see it failed by the modal staying open
    } finally {
      setIsCreatingSport(false);
    }
  };

  const handleDeleteSport = async (sportId) => {
    setDeletingSportId(sportId);
    try {
      await deleteAthleteSportSettings(sportId);
      if (onProfileUpdate) {
        onProfileUpdate();
      }
    } catch (error) {
      console.error('Failed to delete sport:', error);
      // Error will be shown in console
    } finally {
      setDeletingSportId(null);
    }
  };

  const handleUpdateActivities = async (settingsId) => {
    setUpdateActivitiesState(prev => ({ ...prev, [settingsId]: { loading: true } }));
    try {
      const result = await fetchMatchingActivities(settingsId);
      const count = Array.isArray(result) ? result.length : 0;
      setUpdateActivitiesState(prev => ({ ...prev, [settingsId]: { count } }));
    } catch (error) {
      console.error('Failed to fetch matching activities:', error);
      setUpdateActivitiesState(prev => ({ ...prev, [settingsId]: { error: true } }));
    }
  };

  const handleApplySettings = async (settingsId) => {
    setUpdateActivitiesState(prev => ({ ...prev, [settingsId]: { applying: true } }));
    try {
      await applySettingsToActivities(settingsId);
      setUpdateActivitiesState(prev => ({ ...prev, [settingsId]: { done: true } }));
      setTimeout(() => {
        setUpdateActivitiesState(prev => {
          const newState = { ...prev };
          delete newState[settingsId];
          return newState;
        });
      }, 5000);
    } catch (error) {
      console.error('Failed to apply settings:', error);
      setUpdateActivitiesState(prev => ({ ...prev, [settingsId]: { error: true } }));
    }
  };

  const handleCancelUpdate = (settingsId) => {
    setUpdateActivitiesState(prev => {
      const newState = { ...prev };
      delete newState[settingsId];
      return newState;
    });
  };

  const toggleTypeSelection = (type) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  return {
    isAddSportModalOpen,
    setIsAddSportModalOpen,
    availableActivityTypes,
    loadingActivityTypes,
    selectedTypes,
    addSportSearch,
    setAddSportSearch,
    isCreatingSport,
    deletingSportId,
    updateActivitiesState,
    handleOpenAddSport,
    handleCreateSport,
    handleDeleteSport,
    handleUpdateActivities,
    handleApplySettings,
    handleCancelUpdate,
    toggleTypeSelection
  };
};
