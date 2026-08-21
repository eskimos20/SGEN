import React from 'react';
import { Search } from 'lucide-react';
import { CATEGORIES } from '../../hooks/useWorkoutSearch';

const SearchFilters = ({
  searchCategories,
  toggleSearchCategory,
  searchTssRange,
  setSearchTssRange,
  searchDurationRange,
  setSearchDurationRange,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  searchLibrary,
  setSearchLibrary,
  searchSportType,
  setSearchSportType,
  onSearch,
  isSearching,
  handleSortChange
}) => {
  return (
    <div className="bg-white rounded-xl sm:shadow-sm p-3 sm:p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => toggleSearchCategory(cat.id)}
                className={`px-2 py-1.5 rounded-lg font-medium text-xs transition-colors ${
                  searchCategories.includes(cat.id)
                    ? `${cat.color} text-white`
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">TSS Range</label>
            <select 
              value={searchTssRange}
              onChange={(e) => setSearchTssRange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="">All TSS</option>
              <option value="0-40">0-40 TSS</option>
              <option value="40-70">40-70 TSS</option>
              <option value="70-100">70-100 TSS</option>
              <option value="100-150">100-150 TSS</option>
              <option value="150+">150+ TSS</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
            <select 
              value={searchDurationRange}
              onChange={(e) => setSearchDurationRange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="">All Duration</option>
              <option value="0-30">0-30 min</option>
              <option value="30-60">30-60 min</option>
              <option value="60-90">60-90 min</option>
              <option value="90+">90+ min</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sort Field</label>
            <select 
              value={sortBy}
              onChange={(e) => {
                const newSortBy = e.target.value;
                setSortBy(newSortBy);
                handleSortChange(newSortBy, sortOrder);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="duration">Duration</option>
              <option value="category">Category (A-Z)</option>
              <option value="tss">TSS</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sort Order</label>
            <select 
              value={sortOrder}
              onChange={(e) => {
                const newSortOrder = e.target.value;
                setSortOrder(newSortOrder);
                handleSortChange(sortBy, newSortOrder);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Library</label>
            <select 
              value={searchLibrary}
              onChange={(e) => setSearchLibrary(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="workout-library">Workout Library</option>
              <option value="custom-workout-library">Custom Workout Library</option>
              <option value="both">Both</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sport Type</label>
            <select 
              value={searchSportType}
              onChange={(e) => setSearchSportType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="both">Both</option>
              <option value="Ride">Ride</option>
              <option value="Run">Run</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <button 
              onClick={onSearch}
              disabled={isSearching}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" />
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchFilters;
