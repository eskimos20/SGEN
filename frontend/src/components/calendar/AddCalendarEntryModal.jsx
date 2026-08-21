import { useState, useRef, useEffect } from 'react';
import { X, Loader2, FileUp, CheckCircle, Upload } from 'lucide-react';
import api from '../../api/axios';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const SPORT_TYPES = [
  'Ride', 'Run', 'Swim', 'Walk', 'WeightTraining', 'Hike', 'AlpineSki',
  'BackcountrySki', 'Canoeing', 'Crossfit', 'Elliptical', 'Golf', 'Handcycle',
  'IceSkate', 'InlineSkate', 'Kayaking', 'Kitesurf', 'NordicSki', 'RockClimbing',
  'RollerSki', 'Rowing', 'Snowboard', 'Snowshoe', 'Soccer', 'StairStepper',
  'StandUpPaddling', 'Surfing', 'VirtualRide', 'VirtualRun', 'Wheelchair',
  'Windsurf', 'Yoga', 'Other'
];

const SUB_TYPES = ['None', 'Long', 'Recovery', 'Interval', 'Race', 'Tempo', 'Threshold', 'Sprint'];

const ACCEPTED_EXTENSIONS = '.fit,.tcx,.gpx,.zip,.gz';

const CATEGORY_LABELS = {
  WORKOUT: 'Workout',
  NOTE: 'Note',
  RACE_A: 'A Race',
  RACE_B: 'B Race',
  RACE_C: 'C Race',
  HOLIDAY: 'Holiday',
  SICK: 'Sick',
  INJURED: 'Injured',
  SEASON_START: 'Season',
  WELLNESS: 'Wellness Data',
};

const isWorkoutCategory = (cat) =>
  cat === 'WORKOUT';

const isRaceCategory = (cat) =>
  ['RACE_A', 'RACE_B', 'RACE_C'].includes(cat);

const isSimpleCategory = (cat) =>
  ['NOTE', 'HOLIDAY', 'SICK', 'INJURED', 'SEASON_START', 'WELLNESS'].includes(cat);

const isDateRangeCategory = (cat) =>
  ['HOLIDAY', 'SICK', 'INJURED', 'NOTE'].includes(cat);

const parseDurationToSeconds = (str) => {
  if (!str || !str.trim()) return null;
  const parts = str.trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0] * 60;
  return null;
};

const AddCalendarEntryModal = ({ isOpen, onClose, entryType, date, onCreated, editEvent }) => {
  // Lock background scroll when modal is open
  useLockBodyScroll(isOpen);
  
  const [name, setName] = useState('');
  const [sport, setSport] = useState(entryType?.type || 'Ride');
  const [indoor, setIndoor] = useState(false);
  const [entryDate, setEntryDate] = useState('');
  const [entryTime, setEntryTime] = useState('');
  const [duration, setDuration] = useState('');
  const [load, setLoad] = useState('');
  const [subType, setSubType] = useState('None');
  const [description, setDescription] = useState('');
  const [showOnFitnessLine, setShowOnFitnessLine] = useState(false);
  
  // New state for events with date ranges
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Update dates when date prop changes
  useEffect(() => {
    if (date) {
      setEntryDate(date);
      setStartDate(date);
      setEndDate(date);
    }
  }, [date]);

  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

  // Initialize form with editEvent data if provided
  useEffect(() => {
    if (editEvent) {
      setName(editEvent.name || '');
      setDescription(editEvent.description || '');
      
      // Parse dates from editEvent
      if (editEvent.start_date_local) {
        const parsedStartDate = editEvent.start_date_local.substring(0, 10);
        setEntryDate(parsedStartDate);
        setStartDate(parsedStartDate);
        const startTime = editEvent.start_date_local.substring(11, 16);
        setEntryTime(startTime);
      }
      
      if (editEvent.end_date_local && editEvent.category && isDateRangeCategory(editEvent.category)) {
        let parsedEndDate = editEvent.end_date_local.substring(0, 10);
        // If end_date_local has T00:00:00, subtract 1 day to get correct display range
        // because Intervals.icu interprets YYYY-MM-DDT00:00:00 as end of previous day
        if (editEvent.end_date_local.endsWith('T00:00:00')) {
          const endDateObj = new Date(parsedEndDate);
          endDateObj.setDate(endDateObj.getDate() - 1);
          parsedEndDate = endDateObj.toISOString().split('T')[0];
        }
        setEndDate(parsedEndDate);
      }
      
      // Set other fields
      setLoad(editEvent.icu_training_load?.toString() || '');
    }
  }, [editEvent]);

  if (!isOpen || !entryType) return null;

  const category = entryType.category;
  const showWorkoutFields = isWorkoutCategory(category);
  const showRaceFields = isRaceCategory(category);
  const showSimpleFields = isSimpleCategory(category);
  const showDateRangeFields = isDateRangeCategory(category);
  const requiresFile = entryType.requiresFile || showWorkoutFields || showRaceFields;

  const resetForm = () => {
    setName('');
    setSport(entryType?.type || 'Ride');
    setIndoor(false);
    setEntryDate(date || '');
    setEntryTime('');
    setDuration('');
    setLoad('');
    setSubType('None');
    setDescription('');
    setShowOnFitnessLine(false);
    setStartDate(date || '');
    setEndDate(date || '');
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setError(null);
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    // Validation for date range events
    if (showDateRangeFields) {
      if (!startDate || !endDate) {
        setError('Please select both start and end dates.');
        return;
      }
      if (new Date(startDate) > new Date(endDate)) {
        setError('Start date must be before end date.');
        return;
      }
    } else if (!entryDate) {
      setError('Please select a date.');
      return;
    }

    // No file validation required - entries can be created with or without files

    setIsSubmitting(true);
    setError(null);

    try {
      let eventPayload = {
        category,
        name: name.trim() || CATEGORY_LABELS[category] || 'Entry',
      };

      // Handle date range events
      if (showDateRangeFields) {
        eventPayload.start_date_local = `${startDate}T00:00:00`;
        // Intervals.icu API changes T23:59:59 to T00:00:00, so we send one day later with T23:59:59
        const endDateObj = new Date(endDate);
        endDateObj.setDate(endDateObj.getDate() + 1);
        const adjustedEndDate = endDateObj.toISOString().split('T')[0];
        eventPayload.end_date_local = `${adjustedEndDate}T23:59:59`;
      } else {
        // Handle single date events
        const startDate = entryTime
          ? `${entryDate}T${entryTime}:00`
          : `${entryDate}T00:00:00`;
        eventPayload.start_date_local = startDate;
      }

      // Add workout-specific fields for workout/race entries
      if (showWorkoutFields || showRaceFields) {
        eventPayload.type = sport;
        if (indoor) eventPayload.indoor = true;
        const secs = parseDurationToSeconds(duration);
        if (secs) eventPayload.moving_time = secs;
        if (load && !isNaN(Number(load))) eventPayload.icu_training_load = Number(load);
        if (subType && subType !== 'None') eventPayload.sub_type = subType;
        if (showOnFitnessLine) eventPayload.icu_show_on_fitness_line = true;
      }

      // Add description if provided
      if (description.trim()) eventPayload.description = description.trim();

      // Add file data if a file is provided
      if (file) {
        // Convert file to base64
        const fileContent = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]); // Remove data:application/...;base64, prefix
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        eventPayload.filename = file.name;
        eventPayload.file_contents_base64 = fileContent;
      }

      if (editEvent) {
        // Edit existing event
        await api.put(`/statistics/calendar/event/${editEvent.id}`, eventPayload);
      } else {
        // Create new event
        const response = await api.post('/statistics/calendar/events/batch', {
          events: [eventPayload],
        });
      }

      resetForm();
      if (onCreated) onCreated();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to create entry. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[85vh] sm:h-auto sm:max-h-[85vh] rounded-t-2xl sm:rounded-t-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 bg-blue-600 flex-shrink-0 sm:rounded-t-2xl">
          <h3 className="text-sm sm:text-lg font-semibold text-white truncate pr-4">
            {editEvent ? `Edit ${CATEGORY_LABELS[category] || 'Event'}` : (CATEGORY_LABELS[category] || 'Add Calendar Entry')}
          </h3>
          <button onClick={handleClose} className="p-1.5 hover:bg-blue-700 rounded-lg transition-colors flex-shrink-0">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
          {/* Category + Name row */}
          <div className="grid grid-cols-1 sm:flex sm:gap-3 gap-3">
            <div className="sm:w-36">
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700 font-medium">
                {CATEGORY_LABELS[category] || category}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          </div>

          {/* Sport + Indoor + Color (workout/race only) */}
          {(showWorkoutFields || showRaceFields) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Sport</label>
                <select
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                >
                  {SPORT_TYPES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 mb-2 cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={indoor}
                  onChange={(e) => setIndoor(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Indoor</span>
              </label>
            </div>
          )}

          {/* Date + Time */}
          {!showDateRangeFields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div className="sm:w-32">
                <label className="block text-xs font-medium text-gray-500 mb-1">Time</label>
                <input
                  type="time"
                  value={entryTime}
                  onChange={(e) => setEntryTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>
          )}

          {/* Date Range for HOLIDAY, SICK, INJURED, NOTE */}
          {showDateRangeFields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>
          )}

          {/* Duration + Load */}
          {(showWorkoutFields || showRaceFields) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Duration</label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="1h 30m"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div className="sm:w-36">
                <label className="block text-xs font-medium text-gray-500 mb-1">Load</label>
                <input
                  type="number"
                  value={load}
                  onChange={(e) => setLoad(e.target.value)}
                  placeholder="—"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div className="sm:w-36">
                <label className="block text-xs font-medium text-gray-500 mb-1">Sub Type</label>
                <select
                  value={subType}
                  onChange={(e) => setSubType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                >
                  {SUB_TYPES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Show on fitness line (workout only) */}
          {showWorkoutFields && (
            <div className="flex items-center justify-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnFitnessLine}
                  onChange={(e) => setShowOnFitnessLine(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-600">Show on fitness line</span>
              </label>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
            />
          </div>

          {/* Import section - only show for entries that require files */}
          {requiresFile && (
            <div className="space-y-3 border border-blue-200 rounded-xl p-4 bg-blue-50">
              <div>
                <p className="text-xs font-medium text-blue-700">Import activity file (FIT, TCX, GPX)</p>
                <p className="text-xs text-blue-600 mt-1">
                  💡 Optional: Add an activity file (FIT, TCX, GPX) for structured workout data
                </p>
              </div>
              <div
                onDrop={handleFileDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                  file ? 'border-green-300 bg-green-50' : 'border-blue-300 hover:border-blue-400 hover:bg-blue-100/50'
                }`}
              >
                {file ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <CheckCircle className="h-7 w-7 text-green-500" />
                    <p className="text-sm font-medium text-green-700">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB — Click to change</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <FileUp className="h-7 w-7 text-blue-400" />
                    <p className="text-sm font-medium text-gray-600">Drag & drop or click to select</p>
                    <p className="text-xs text-gray-400">Supported: .fit, .tcx, .gpx, .zip, .gz</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-gray-200 px-5 py-4 bg-gray-50 flex-shrink-0">
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {editEvent ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                editEvent ? 'Save Changes' : 'Create Entry'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddCalendarEntryModal;
