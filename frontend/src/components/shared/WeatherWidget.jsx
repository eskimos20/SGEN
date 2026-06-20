import { useState } from 'react';
import { Cloud, MapPin, Settings } from 'lucide-react';
import { useWeather } from '../../hooks/useWeather';
import WeatherSearch from './weather/WeatherSearch';
import WeatherDay from './weather/WeatherDay';

const WeatherWidget = () => {
    const { forecasts, userLocation, loading, error, saveLocation } = useWeather();
    const [showSettings, setShowSettings] = useState(false);

    const handleSelect = async (station) => {
        try {
            await saveLocation(station);
            setShowSettings(false);
        } catch (err) {
            console.error('Failed to save location:', err);
        }
    };

    const header = (
        <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
                <Cloud className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900">Weather Forecast</h2>
                {userLocation && (
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {userLocation.cityName}
                    </p>
                )}
            </div>
            <button
                onClick={() => setShowSettings((v) => !v)}
                className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                title="Change location"
            >
                <Settings className="h-4 w-4" />
            </button>
        </div>
    );

    if (loading) {
        return (
            <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
                {header}
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
            </div>
        );
    }

    if (error && forecasts.length === 0) {
        return (
            <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
                {header}
                {showSettings ? (
                    <WeatherSearch onSelect={handleSelect} onCancel={() => setShowSettings(false)} />
                ) : (
                    <div className="text-center py-8">
                        <p className="text-gray-500 mb-4">{error}</p>
                        <button
                            onClick={() => setShowSettings(true)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                            Set Location
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
            {header}

            {showSettings && (
                <div className="mb-4 p-4 border border-gray-200 rounded-lg">
                    <WeatherSearch onSelect={handleSelect} onCancel={() => setShowSettings(false)} />
                </div>
            )}

            {forecasts.length > 0 ? (
                <div className="overflow-x-auto pb-2">
                    <div className="flex gap-3 min-w-max sm:min-w-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {forecasts.slice(0, 7).map((day, idx) => (
                            <WeatherDay key={idx} day={day} isFirst={idx === 0} />
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-center py-8">
                    <p className="text-gray-500">No weather data available</p>
                </div>
            )}
        </div>
    );
};

export default WeatherWidget;
