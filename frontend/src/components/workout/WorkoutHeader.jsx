import { Save } from 'lucide-react';

export const CATEGORIES = [
  { id: 'Endurance', name: 'Endurance', color: 'bg-blue-500' },
  { id: 'Tempo', name: 'Tempo', color: 'bg-green-500' },
  { id: 'SweetSpot', name: 'Sweet Spot', color: 'bg-yellow-500' },
  { id: 'Threshold', name: 'Threshold', color: 'bg-orange-500' },
  { id: 'VO2Max', name: 'VO2Max', color: 'bg-red-500' },
  { id: 'Anaerobic', name: 'Anaerobic', color: 'bg-purple-500' },
  { id: 'Sprint', name: 'Sprint', color: 'bg-pink-500' }
];

const WorkoutHeader = ({
  autoWorkoutName,
  sportType,
  setSportType,
  selectedCategory,
  setSelectedCategory,
  description,
  setDescription,
  shortDescription,
  setShortDescription,
  workoutMetrics,
  onSave,
  isSaving,
  hasSteps
}) => {
  return (
    <>
      {/* Page Header */}
      <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl sm:shadow-sm p-3 sm:p-6 border-b sm:border border-gray-200">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Workout Creator</h1>
        <p className="text-gray-600 mt-1">Drag intervals to build your custom workout</p>
      </div>

      {/* Settings Card */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
        {/* Workout Info and Category */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Name (auto-generated)</label>
            <input
              type="text"
              value={autoWorkoutName}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed text-sm"
            />
          </div>

          {/* Sport Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sport Type</label>
            <select
              value={sportType}
              onChange={(e) => setSportType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="Ride">🚴 Ride (Cycling)</option>
              <option value="Run">🏃 Run</option>
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2 py-1.5 rounded-lg font-medium text-xs transition-colors ${
                    selectedCategory === cat.id
                      ? `${cat.color} text-white`
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Description, Short Description, Metrics and Save */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Describe your workout..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Short Description</label>
              <input
                type="text"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="e.g. 5x(19min@55-70%)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          </div>

          {/* Metrics + Save */}
          <div className="flex items-end justify-between gap-4">
            <div className="flex gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{Math.round(workoutMetrics.tss)}</div>
                <div className="text-xs text-gray-600">TSS</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{Math.round(workoutMetrics.duration / 60)}</div>
                <div className="text-xs text-gray-600">Minutes</div>
              </div>
            </div>
            <button
              onClick={onSave}
              disabled={isSaving || !hasSteps}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors text-sm font-medium"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default WorkoutHeader;
