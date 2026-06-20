import { Loader2, ChevronDown, ChevronUp, Trophy, Settings, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { calculateAge, getSportColorClasses, getSportCategory } from '../../utils/athleteUtils';
import { fetchAvailableActivityTypes } from '../../utils/fitnessService';
import { useProfileEdit } from '../../hooks/useProfileEdit';
import { useAthleteSports } from '../../hooks/useAthleteSports';
import ProfileEditModal from './ProfileEditModal';
import AddSportModal from './AddSportModal';
import SportCard from './SportCard';
import ConfirmDialog from '../modals/ConfirmDialog';

const AthleteProfile = ({ athleteProfile, loadingProfile, onProfileUpdate }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, sportId: null, sportName: '' });
  
  // Profile edit hook
  const {
    isEditModalOpen,
    setIsEditModalOpen,
    isSaving,
    editForm,
    setEditForm,
    handleSaveProfile
  } = useProfileEdit(athleteProfile, onProfileUpdate);

  // Sports management hook
  const {
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
  } = useAthleteSports(onProfileUpdate);
  
  // Load expanded state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('athleteProfile-sportsExpanded');
    if (saved !== null) {
      setIsExpanded(saved === 'true');
    }
  }, []);
  
  // Save expanded state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('athleteProfile-sportsExpanded', isExpanded.toString());
  }, [isExpanded]);

  if (loadingProfile) {
    return (
      <div className="card flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600 mr-2" />
        <span className="text-gray-600">Loading athlete profile...</span>
      </div>
    );
  }

  if (!athleteProfile?.athlete) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Statistics</h1>
        <p className="text-gray-600 mt-1">Fetch and analyze your training data from Intervals.icu</p>
      </div>
    );
  }

  const athlete = athleteProfile.athlete;
  const allSportSettings = athlete.sportSettings || [];
  const restingHr = athlete.icu_resting_hr || athlete.resting_hr;
  const weight = athlete.icu_weight || athlete.weight;
  const height = athlete.height;
  const age = calculateAge(athlete.icu_date_of_birth);
  
  // Filter and deduplicate sport settings
  const sportCategories = allSportSettings
    .map(settings => ({ settings, category: getSportCategory(settings.types) }))
    .filter(item => item.category !== null);

  const handleEditSport = async (settings, category) => {
    const ftp = settings.ftp;
    const supportsPower = ftp > 0;
    
    setIsEditModalOpen(true);
    setEditForm({
      sportId: settings.id,
      sportName: category.name,
      sportFtp: ftp || '',
      sportLthr: settings.lthr || '',
      sportMaxHr: settings.max_hr || '',
      sportHrZones: settings.hr_zones || [],
      sportPowerZones: settings.power_zones || [],
      supportsPower: supportsPower,
      originalSupportsPower: supportsPower,
      sportTypes: [...(settings.types || [])],
      editTypeSearch: ''
    });
    
    // Fetch available activity types if not already loaded
    if (availableActivityTypes.length === 0) {
      try {
        const types = await fetchAvailableActivityTypes();
        // This would need to be handled by the hook
      } catch (err) {
        console.error('Failed to fetch activity types:', err);
      }
    }
  };

  const handleConfirmDeleteSport = async () => {
    const { sportId } = deleteDialog;
    setDeleteDialog({ isOpen: false, sportId: null, sportName: '' });
    await handleDeleteSport(sportId);
  };

  return (
    <div className="space-y-4">
      {/* Main Profile Header */}
      <div className="card-mobile bg-gradient-to-r from-primary-50 to-blue-50">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              {athlete.profile_medium ? (
                <img 
                  src={athlete.profile_medium} 
                  alt={athlete.name || 'Profile'} 
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-3 border-white shadow-lg"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary-600 flex items-center justify-center text-white text-2xl sm:text-3xl font-bold">
                  {athlete.name?.charAt(0) || athlete.id?.charAt(0) || 'A'}
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                  {athlete.name || athlete.id}
                </h1>
                <p className="text-gray-600 text-sm sm:text-base">
                  {athlete.city && `${athlete.city}, `}
                  {athlete.country || 'Athlete'}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsEditModalOpen(true);
                  setEditForm({
                    weight: weight || '',
                    height: height ? height.toString().replace(',', '.') : '',
                    restingHr: restingHr || ''
                  });
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Edit Profile Settings"
              >
                <Settings className="h-5 w-5 text-gray-600" />
              </button>
            </div>
          </div>
          
          {/* Basic Info */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
            {athlete.sex && (
              <div className="text-center p-2 bg-white/80 sm:bg-white sm:rounded-lg sm:shadow-sm">
                <div className="text-lg font-bold text-gray-900">{athlete.sex === 'M' ? '♂️' : '♀️'}</div>
                <div className="text-xs text-gray-500">{athlete.sex === 'M' ? 'Male' : 'Female'}</div>
              </div>
            )}
            {age && (
              <div className="text-center p-2 bg-white/80 sm:bg-white sm:rounded-lg sm:shadow-sm">
                <div className="text-lg font-bold text-gray-900">{age}</div>
                <div className="text-xs text-gray-500">Age</div>
              </div>
            )}
            {weight > 0 && (
              <div className="text-center p-2 bg-white/80 sm:bg-white sm:rounded-lg sm:shadow-sm">
                <div className="text-lg font-bold text-gray-900">{weight} kg</div>
                <div className="text-xs text-gray-500">Weight</div>
              </div>
            )}
            {height > 0 && (
              <div className="text-center p-2 bg-white/80 sm:bg-white sm:rounded-lg sm:shadow-sm">
                <div className="text-lg font-bold text-gray-900">{height} cm</div>
                <div className="text-xs text-gray-500">Height</div>
              </div>
            )}
            {restingHr > 0 && (
              <div className="text-center p-2 bg-white/80 sm:bg-white sm:rounded-lg sm:shadow-sm">
                <div className="text-lg font-bold text-gray-900">{restingHr}</div>
                <div className="text-xs text-gray-500">Resting HR</div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Sport-specific Settings */}
      <div className="card-mobile">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity flex-1"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-600" />
              Sport Settings
              {isExpanded ? (
                <ChevronUp className="h-5 w-5 text-gray-600" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-600" />
              )}
            </h2>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleOpenAddSport(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
            title="Add a new sport"
          >
            <Plus className="h-4 w-4" />
            Add Sport
          </button>
        </div>
        
        {isExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {sportCategories.map(({ settings, category }, idx) => (
              <SportCard
                key={idx}
                settings={settings}
                category={category}
                weight={weight}
                deletingSportId={deletingSportId}
                updateActivitiesState={updateActivitiesState}
                onEdit={handleEditSport}
                onDelete={(sportId, sportName) => setDeleteDialog({ isOpen: true, sportId, sportName })}
                onUpdateActivities={handleUpdateActivities}
                onApplySettings={handleApplySettings}
                onCancelUpdate={handleCancelUpdate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Profile Edit Modal */}
      <ProfileEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        editForm={editForm}
        setEditForm={setEditForm}
        isSaving={isSaving}
        onSave={handleSaveProfile}
        availableActivityTypes={availableActivityTypes}
        loadingActivityTypes={loadingActivityTypes}
        allSportSettings={allSportSettings}
      />

      {/* Add Sport Modal */}
      <AddSportModal
        isOpen={isAddSportModalOpen}
        onClose={() => setIsAddSportModalOpen(false)}
        availableActivityTypes={availableActivityTypes}
        loadingActivityTypes={loadingActivityTypes}
        selectedTypes={selectedTypes}
        addSportSearch={addSportSearch}
        setAddSportSearch={setAddSportSearch}
        isCreatingSport={isCreatingSport}
        onCreateSport={handleCreateSport}
        onToggleType={toggleTypeSelection}
      />

      {/* Delete Sport Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Delete Sport"
        message={`Are you sure you want to delete ${deleteDialog.sportName}?\n\nThis will remove the sport and its settings from Intervals.icu.\n\nThis action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmStyle="danger"
        onConfirm={handleConfirmDeleteSport}
        onCancel={() => setDeleteDialog({ isOpen: false, sportId: null, sportName: '' })}
      />
    </div>
  );
};

export default AthleteProfile;
