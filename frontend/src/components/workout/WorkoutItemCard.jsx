import React from 'react';
import { CheckCircle, Sparkles, Activity, Clock, Zap, RefreshCw, Smile, Meh, Frown, Utensils, Move } from 'lucide-react';
import WorkoutChart from './WorkoutChart';
import { formatDuration } from '../../utils/dataUtils';
import { extractTSSFromName, parseWorkoutName } from '../../utils/workoutUtils';
import { getActivityKcal } from '../../utils/nutritionUtils';
import { getSportSettingsForType } from '../../utils/zoneUtils';
import { getSportEmoji, getEventEmoji } from '../../utils/sportTypeUtils';

const WorkoutItemCard = ({
  item,
  itemIdx,
  isMobile = false,
  isRegenerating,
  regeneratingDate,
  draggedEvent,
  selectedCategoryPerDate,
  sportSettings,
  onEventClick,
  onDragStart,
  onDragEnd,
  onRegenerateWorkout,
  onCategoryChange,
  onMoveWorkout
}) => {
  // Get FTP from athlete sport settings for this activity type
  // Prioritize 'type' from Intervals.icu as it's always consistent (e.g., 'Ride', 'Run', 'VirtualRide')
  const activityType = item.type || item.activityType || item.sport_type || item.workout_doc?.sport_type;
  const itemSportSettings = getSportSettingsForType(sportSettings, activityType);
  const ftp = itemSportSettings.ftp;
  
  // Use event emoji for special categories, sport emoji for workouts
  const itemIcon = item.category && ['SICK', 'HOLIDAY', 'NOTE', 'INJURED', 'RACE_A', 'RACE_B', 'RACE_C', 'SEASON_START', 'WELLNESS'].includes(item.category) 
    ? getEventEmoji(item.category)
    : getSportEmoji(activityType);
  
  const itemDateStr = item.start_date_local?.substring(0, 10);
  
  // Parse workout name to separate main name from short description
  const { mainName, shortDescription } = parseWorkoutName(item.name);
  const isCurrentlyRegenerating = regeneratingDate === itemDateStr;
  
  // Determine if this is a hard day
  const hardCategories = ['Anaerobic', 'Sprint', 'Sweetspot', 'Tempo', 'Threshold', 'VO2Max'];
  const isDeloadWeek = item.isDeloadWeek;
  const isHardDay = !isDeloadWeek && (item.isPending ? 
    (item.hardCategories && item.hardCategories.length > 0) : 
    (item.type === 'Hard' || (item.category && hardCategories.includes(item.category))));
  const isEasyDay = !isHardDay;

  const handleRegenerateClick = (e) => {
    e.stopPropagation();
    if (isEasyDay) {
      onRegenerateWorkout(itemDateStr, 'Endurance');
    } else {
      const availableCategories = item.hardCategories || [];
      if (availableCategories.length === 0) {
        const globalCategories = ['Anaerobic', 'Sprint', 'Sweetspot', 'Tempo', 'Threshold', 'VO2Max'];
        const randomCategory = globalCategories[Math.floor(Math.random() * globalCategories.length)];
        onRegenerateWorkout(itemDateStr, randomCategory);
        return;
      }
      const hasMultipleCategories = availableCategories.length > 1;
      const defaultValue = hasMultipleCategories ? 'Any' : availableCategories[0];
      let selectedCat = selectedCategoryPerDate[itemDateStr] || defaultValue;
      if (selectedCat === 'Any') {
        selectedCat = availableCategories[Math.floor(Math.random() * availableCategories.length)];
      }
      onRegenerateWorkout(itemDateStr, selectedCat);
    }
  };

  const handleCategorySelect = (e) => {
    e.stopPropagation();
    const newCategory = e.target.value;
    onCategoryChange(itemDateStr, newCategory);
  };

  const handleMoveClick = (e) => {
    e.stopPropagation();
    if (onMoveWorkout) {
      onMoveWorkout(item);
    }
  };

  const cardClasses = isMobile 
    ? `p-3 rounded-lg transition-shadow relative ${
        item.isCompleted 
          ? 'bg-green-50 border border-green-200' 
          : item.isPending
            ? 'bg-blue-50 border border-blue-300 border-dashed'
            : 'bg-white border border-gray-200'
      } ${draggedEvent?.id === item.id ? 'opacity-50' : ''} ${!item.isCompleted ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} hover:shadow-md`
    : `text-xs p-2 rounded-lg transition-shadow relative ${
        item.isCompleted 
          ? 'bg-green-50 border border-green-200' 
          : item.isPending
            ? 'bg-blue-50 border border-blue-300 border-dashed'
            : 'bg-white border border-gray-200'
      } ${draggedEvent?.id === item.id ? 'opacity-50' : ''} ${!item.isCompleted ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} hover:shadow-md`;

  const textSizes = isMobile ? {
    container: 'text-sm',
    name: 'text-sm',
    time: 'text-sm',
    chartHeight: 'h-8'
  } : {
    container: 'text-xs',
    name: 'text-xs',
    time: 'text-xs',
    chartHeight: 'h-6'
  };

  return (
    <div
      key={item.id || `${isMobile ? 'mobile' : 'desktop'}-item-${itemIdx}`}
      onClick={(e) => {
  e.stopPropagation();
  onEventClick(item);
}}
      draggable={!item.isCompleted}
      onDragStart={(e) => onDragStart(e, item)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
      className={cardClasses}
    >
      <div className="flex items-center justify-between gap-1 mb-2">
        <div className="flex items-center gap-2 font-medium flex-1 min-w-0">
          {item.isCompleted ? (
            <CheckCircle className={`${isMobile ? 'h-4' : 'h-3'} w-${isMobile ? '4' : '3'} flex-shrink-0 text-green-600`} />
          ) : item.isPending ? (
            <Sparkles className={`${isMobile ? 'h-4' : 'h-3'} w-${isMobile ? '4' : '3'} flex-shrink-0 text-blue-600`} />
          ) : (
            <Activity className={`${isMobile ? 'h-4' : 'h-3'} w-${isMobile ? '4' : '3'} flex-shrink-0 text-blue-600`} />
          )}
          {/* Sport type icon */}
          <span 
            className={`${isMobile ? 'text-lg' : 'text-base'} flex-shrink-0`}
            title={activityType}
          >
            {itemIcon}
          </span>
          <div className="flex flex-col min-w-0 flex-1">
            <span className={`truncate font-medium ${item.isCompleted ? 'text-green-800' : item.isPending ? 'text-blue-800' : 'text-gray-800'} ${textSizes.name}`}>
              {mainName}
            </span>
            {shortDescription && (
              <span className={`truncate ${item.isCompleted ? 'text-green-600' : item.isPending ? 'text-blue-600' : 'text-gray-600'} ${isMobile ? 'text-xs' : 'text-[10px]'} font-normal`}>
                {shortDescription}
              </span>
            )}
          </div>
        </div>
        {!item.isCompleted && isDeloadWeek && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Deload</span>
        )}
        {item.isPending && (
          <button
            onClick={handleRegenerateClick}
            disabled={isCurrentlyRegenerating}
            className="p-1 hover:bg-blue-200 rounded transition-colors flex-shrink-0 z-10"
            title="Regenerate workout"
          >
            <RefreshCw className={`${isMobile ? 'h-4' : 'h-3'} w-${isMobile ? '4' : '3'} text-blue-600 ${isCurrentlyRegenerating ? 'animate-spin' : ''}`} />
          </button>
        )}
        {isMobile && !item.isCompleted && !item.isPending && 
          item.category === 'WORKOUT' && (
          <button
            onClick={handleMoveClick}
            className="p-1 hover:bg-gray-200 rounded transition-colors flex-shrink-0 z-10"
            title="Move workout"
          >
            <Move className="h-4 w-4 text-gray-600" />
          </button>
        )}
      </div>
      
      {item.moving_time && (
        <div className={`flex items-center gap-3 ${item.isCompleted ? 'text-green-600' : 'text-gray-500'} ${textSizes.time}`}>
          <span className="flex items-center gap-1">
            <Clock className={`${isMobile ? 'h-3' : 'h-2.5'} w-${isMobile ? '3' : '2.5'}`} />
            {formatDuration(item.moving_time)}
          </span>
          {(extractTSSFromName(item.name) || item.icu_training_load) && (
            <span className="flex items-center gap-1">
              <Zap className={`${isMobile ? 'h-3' : 'h-2.5'} w-${isMobile ? '3' : '2.5'}`} />
              Load {extractTSSFromName(item.name) || Math.round(item.icu_training_load)}
            </span>
          )}
          {item.isCompleted && getActivityKcal(item) > 0 && (
            <span className="flex items-center gap-1">
              <Utensils className={`${isMobile ? 'h-3' : 'h-2.5'} w-${isMobile ? '3' : '2.5'}`} />
              {getActivityKcal(item)} kcal
            </span>
          )}
        </div>
      )}
      
      {item.workout_doc?.steps && (
        <div className={`mt-${isMobile ? '3' : '2'} rounded ${textSizes.chartHeight} overflow-hidden`}>
          <WorkoutChart 
            workoutDoc={item.workout_doc} 
            ftp={ftp}
            height={textSizes.chartHeight}
            showTooltip={false}
          />
        </div>
      )}
      
      {/* RPE/Feel display for completed activities */}
      {item.isCompleted && (item.icu_rpe || item.feel) && (
        <div className={`mt-${isMobile ? '3' : '2'} pt-${isMobile ? '3' : '2'} border-t border-green-200`}>
          <div className={`flex items-center justify-between ${textSizes.container} text-gray-600`}>
            <span className="font-medium text-gray-500">RPE/Feel</span>
            <div className="flex items-center gap-2">
              {item.icu_rpe && (
                <span className="text-gray-700 font-medium">{item.icu_rpe}</span>
              )}
              {item.feel && (() => {
                const feelConfig = {
                  1: { Icon: Smile, color: 'text-purple-500' },
                  2: { Icon: Smile, color: 'text-green-500' },
                  3: { Icon: Meh, color: 'text-yellow-500' },
                  4: { Icon: Frown, color: 'text-orange-500' },
                  5: { Icon: Frown, color: 'text-red-500' }
                };
                const { Icon, color } = feelConfig[item.feel] || feelConfig[3];
                return <Icon className={`${isMobile ? 'h-3' : 'h-3'} w-${isMobile ? '3' : '3'} ${color}`} fill="currentColor" />;
              })()}
            </div>
          </div>
        </div>
      )}
      
      {/* Dropdown for hard day category selection */}
      {item.isPending && isHardDay && !isDeloadWeek && (() => {
        const availableCategories = item.hardCategories || [];
        if (availableCategories.length === 0) {
          return null;
        }
        const hasMultipleCategories = availableCategories.length > 1;
        const defaultValue = hasMultipleCategories ? 'Any' : availableCategories[0];
        const currentValue = selectedCategoryPerDate[itemDateStr] || defaultValue;
        
        return (
          <div 
            className={`mt-${isMobile ? '3' : '2'} pt-${isMobile ? '3' : '2'} border-t border-purple-200`}
            onClick={(e) => e.stopPropagation()}
          >
            <select
              value={currentValue}
              onChange={handleCategorySelect}
              disabled={!hasMultipleCategories}
              className={`w-full ${textSizes.container} px-${isMobile ? '3' : '2'} py-${isMobile ? '2' : '1'} border border-purple-300 rounded text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                hasMultipleCategories ? 'bg-white cursor-pointer' : 'bg-gray-100 cursor-not-allowed'
              }`}
            >
              {hasMultipleCategories && <option value="Any">Any</option>}
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        );
      })()}
    </div>
  );
};

export default React.memo(WorkoutItemCard);
