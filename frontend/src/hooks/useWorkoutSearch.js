import { useState, useCallback, useEffect } from 'react';
import api from '../api/axios';

export const CATEGORIES = [
  { id: 'Endurance', name: 'Endurance', color: 'bg-blue-500' },
  { id: 'Tempo', name: 'Tempo', color: 'bg-green-500' },
  { id: 'SweetSpot', name: 'Sweet Spot', color: 'bg-yellow-500' },
  { id: 'Threshold', name: 'Threshold', color: 'bg-orange-500' },
  { id: 'VO2Max', name: 'VO2Max', color: 'bg-red-500' },
  { id: 'Anaerobic', name: 'Anaerobic', color: 'bg-purple-500' },
  { id: 'Sprint', name: 'Sprint', color: 'bg-pink-500' }
];

export const useWorkoutSearch = () => {
  const [searchCategories, setSearchCategories] = useState([]);
  const [searchTssRange, setSearchTssRange] = useState('');
  const [searchDurationRange, setSearchDurationRange] = useState('');
  const [searchLibrary, setSearchLibrary] = useState('both');
  const [searchSportType, setSearchSportType] = useState('both');
  const [sortBy, setSortBy] = useState('duration');
  const [sortOrder, setSortOrder] = useState('asc');
  const [searchResults, setSearchResults] = useState([]);
  const [textFilter, setTextFilter] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedWorkoutId, setExpandedWorkoutId] = useState(null);
  const [athleteProfile, setAthleteProfile] = useState(null);

  useEffect(() => {
    const fetchAthleteProfileData = async () => {
      try {
        const response = await api.get('/statistics/athlete-profile');
        setAthleteProfile(response.data);
      } catch (err) {
        console.error('Failed to fetch athlete profile:', err);
      }
    };
    
    fetchAthleteProfileData();
  }, []);

  const getFtpForWorkout = useCallback((workout) => {
    try {
      const sportSettings = athleteProfile?.sportSettings;
      if (!sportSettings || !Array.isArray(sportSettings)) {
        return 280;
      }
      
      const workoutSportType = workout.sportType || workout.workout_doc?.sport_type || 'bike';
      const sportKey = workoutSportType === 'run' ? 'Run' : 'Ride';
      
      const sportSetting = sportSettings.find(setting => 
        setting.types && setting.types.some(type => type === sportKey)
      );
      
      if (sportSetting && sportSetting.ftp) {
        return sportSetting.ftp;
      } else {
        return sportKey === 'Run' ? 240 : 280;
      }
    } catch (err) {
      console.error('Failed to get FTP for workout:', err);
      return 280;
    }
  }, [athleteProfile]);

  const getSportType = useCallback((workout) => {
    return workout.sportType || 
           workout.workout_doc?.sport_type || 
           workout.workout_doc?.sportType || 
           workout.sport_type || 
           workout.type || 
           workout.activityType || 
           'bike';
  }, []);

  const getSportTypeDisplayName = useCallback((workout) => {
    const sportType = getSportType(workout);
    return sportType === 'bike' ? 'Cycling' : 
           sportType === 'run' ? 'Running' : 
           sportType.charAt(0).toUpperCase() + sportType.slice(1);
  }, [getSportType]);

  const toggleSearchCategory = useCallback((categoryId) => {
    setSearchCategories(prev => 
      prev.includes(categoryId)
        ? prev.filter(c => c !== categoryId)
        : [...prev, categoryId]
    );
  }, []);

  const handleSearchWorkouts = useCallback(async () => {
    setIsSearching(true);
    setTextFilter('');
    try {
      let minTss = 0, maxTss = 999;
      if (searchTssRange) {
        [minTss, maxTss] = searchTssRange.includes('+') 
          ? [parseInt(searchTssRange), 999]
          : searchTssRange.split('-').map(Number);
      }
      
      let minDuration = null, maxDuration = null;
      if (searchDurationRange) {
        [minDuration, maxDuration] = searchDurationRange.includes('+') 
          ? [parseInt(searchDurationRange), 999]
          : searchDurationRange.split('-').map(Number);
      }
      
      const params = new URLSearchParams();
      if (searchCategories.length > 0) {
        params.append('categories', searchCategories.join(','));
      }
      params.append('minTss', minTss);
      params.append('maxTss', maxTss);
      if (minDuration !== null) params.append('minDuration', minDuration);
      if (maxDuration !== null) params.append('maxDuration', maxDuration);
      if (searchSportType !== 'both') {
        params.append('sportType', searchSportType);
      }
      params.append('sortBy', sortBy || 'duration');
      params.append('sortOrder', sortOrder || 'asc');
      
      const results = [];
      
      if (searchLibrary === 'workout-library' || searchLibrary === 'both') {
        try {
          const response = await api.get(`/statistics/workout-library?${params}`);
          results.push(...response.data);
        } catch (err) {
          console.error('Failed to search workout library:', err);
        }
      }
      
      if (searchLibrary === 'custom-workout-library' || searchLibrary === 'both') {
        try {
          const response = await api.get(`/statistics/custom-workouts?${params}`);
          results.push(...response.data);
        } catch (err) {
          console.error('Failed to search custom workouts:', err);
        }
      }
      
      setSearchResults(results);
      setHasSearched(true);
    } catch (err) {
      console.error('Search failed:', err);
      throw err;
    } finally {
      setIsSearching(false);
    }
  }, [searchCategories, searchTssRange, searchDurationRange, searchLibrary, searchSportType, sortBy, sortOrder]);

  const filteredResults = textFilter.trim()
    ? searchResults.filter(w => {
        const q = textFilter.toLowerCase();
        return (
          (w.name || '').toLowerCase().includes(q) ||
          (w.description || '').toLowerCase().includes(q) ||
          (w.shortDescription || '').toLowerCase().includes(q)
        );
      })
    : searchResults;

  const handleSortChange = useCallback((newSortBy, newSortOrder) => {
    if (hasSearched && searchResults.length > 0) {
      const sortedResults = [...searchResults].sort((a, b) => {
        let aValue, bValue;
        
        switch (newSortBy) {
          case 'category':
            aValue = a.category || '';
            bValue = b.category || '';
            break;
          case 'duration':
            aValue = a.duration || 0;
            bValue = b.duration || 0;
            break;
          case 'tss':
            aValue = a.tss || 0;
            bValue = b.tss || 0;
            break;
          default:
            return 0;
        }
        
        if (typeof aValue === 'string') {
          return newSortOrder === 'asc' 
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        } else {
          return newSortOrder === 'asc' 
            ? aValue - bValue
            : bValue - aValue;
        }
      });
      
      setSearchResults(sortedResults);
    }
  }, [hasSearched, searchResults]);

  const handleDeleteWorkout = useCallback(async (filename) => {
    await api.delete(`/statistics/custom-workouts/${filename}`);
    setSearchResults(prevResults => 
      prevResults.filter(result => result.filename !== filename)
    );
  }, []);

  return {
    searchCategories,
    setSearchCategories,
    searchTssRange,
    setSearchTssRange,
    searchDurationRange,
    setSearchDurationRange,
    searchLibrary,
    setSearchLibrary,
    searchSportType,
    setSearchSportType,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    searchResults,
    textFilter,
    setTextFilter,
    filteredResults,
    isSearching,
    hasSearched,
    expandedWorkoutId,
    setExpandedWorkoutId,
    getFtpForWorkout,
    getSportType,
    getSportTypeDisplayName,
    toggleSearchCategory,
    handleSearchWorkouts,
    handleSortChange,
    handleDeleteWorkout
  };
};
