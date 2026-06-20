import { MapPin, Search } from 'lucide-react';
import { useWeatherSearch } from '../../../hooks/useWeather';

const WeatherSearch = ({ onSelect, onCancel }) => {
    const { query, setQuery, results, searching, searchError, search, clearResults } = useWeatherSearch();

    const handleSelect = (station) => {
        clearResults();
        onSelect(station);
    };

    return (
        <div className="space-y-3">
            <div className="relative">
                <input
                    type="text"
                    placeholder="Search SMHI station (e.g. Luleå)..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    autoFocus
                />
                <button
                    onClick={() => search()}
                    disabled={searching}
                    className="absolute right-2 top-2 p-1 text-gray-500 hover:text-gray-700 disabled:opacity-40"
                >
                    {searching
                        ? <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-500" />
                        : <Search className="h-4 w-4" />
                    }
                </button>
            </div>

            {searchError && (
                <p className="text-sm text-red-500">{searchError}</p>
            )}

            {results.length > 0 && (
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {results.map((station) => (
                        <li key={station.id}>
                            <button
                                onClick={() => handleSelect(station)}
                                onTouchEnd={() => handleSelect(station)}
                                className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-blue-50 active:bg-blue-100 transition-colors touch-manipulation"
                            >
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-blue-400 shrink-0" />
                                    <div>
                                        <div className="font-medium text-gray-900 text-sm">{station.name}</div>
                                        <div className="text-xs text-gray-500">
                                            {station.latitude.toFixed(2)}°N, {station.longitude.toFixed(2)}°E
                                            {!station.active && <span className="ml-2 text-amber-500">inactive</span>}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <button
                onClick={onCancel}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
                Cancel
            </button>
        </div>
    );
};

export default WeatherSearch;
