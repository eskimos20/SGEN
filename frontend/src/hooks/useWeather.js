import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';

export const useWeather = () => {
    const [forecasts, setForecasts] = useState([]);
    const [userLocation, setUserLocation] = useState(null);
    const [openMeteoEnabled, setOpenMeteoEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchForecasts = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/weather/forecast');
            setForecasts(response.data);
            setError(null);
        } catch (err) {
            console.error('Error fetching weather forecast:', err);
            setError('Failed to load weather data');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchUserLocation = useCallback(async () => {
        try {
            const response = await api.get('/weather/location');
            setUserLocation(response.data);
        } catch {
            // No location set yet is acceptable
        }
    }, []);

    const fetchSettings = useCallback(async () => {
        try {
            const response = await api.get('/weather/settings');
            setOpenMeteoEnabled(Boolean(response.data.openMeteoEnabled));
        } catch (err) {
            console.error('Error fetching weather settings:', err);
        }
    }, []);

    useEffect(() => {
        fetchForecasts();
        fetchUserLocation();
        fetchSettings();
    }, [fetchForecasts, fetchUserLocation, fetchSettings]);

    const saveLocation = useCallback(async (station) => {
        await api.post('/weather/location', {
            latitude: station.latitude,
            longitude: station.longitude,
            cityName: station.name,
            countryName: station.countryName || 'Sweden',
            timezone: station.timezone || 'Europe/Stockholm',
            isDefault: true,
        });
        setUserLocation({
            cityName: station.name,
            countryName: station.countryName || 'Sweden',
            latitude: station.latitude,
            longitude: station.longitude,
        });
        await fetchForecasts();
    }, [fetchForecasts]);

    const toggleOpenMeteo = useCallback(async () => {
        const next = !openMeteoEnabled;
        try {
            await api.post('/weather/settings', { openMeteoEnabled: next });
            setOpenMeteoEnabled(next);
            await fetchForecasts();
        } catch (err) {
            console.error('Error saving weather settings:', err);
        }
    }, [openMeteoEnabled, fetchForecasts]);

    return {
        forecasts,
        userLocation,
        openMeteoEnabled,
        loading,
        error,
        saveLocation,
        toggleOpenMeteo,
        refetch: fetchForecasts,
    };
};

export const useWeatherSearch = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const debounceRef = useRef(null);

    const doSearch = useCallback(async (trimmed) => {
        try {
            setSearching(true);
            setSearchError(null);
            const response = await api.get(`/weather/search/${encodeURIComponent(trimmed)}`);
            setResults(Array.isArray(response.data) ? response.data : [response.data]);
        } catch (err) {
            if (err.response?.status === 404) {
                setResults([]);
                setSearchError('No stations found');
            } else {
                console.error('Station search error:', err);
                setSearchError('Search failed');
            }
        } finally {
            setSearching(false);
        }
    }, []);

    const handleQueryChange = useCallback((value) => {
        setQuery(value);
        clearTimeout(debounceRef.current);
        const trimmed = value.trim();
        if (trimmed.length < 2) {
            setResults([]);
            setSearchError(null);
            return;
        }
        debounceRef.current = setTimeout(() => doSearch(trimmed), 400);
    }, [doSearch]);

    const search = useCallback(() => {
        clearTimeout(debounceRef.current);
        const trimmed = query.trim();
        if (trimmed) doSearch(trimmed);
    }, [query, doSearch]);

    const clearResults = useCallback(() => {
        setResults([]);
        setSearchError(null);
    }, []);

    return { query, setQuery: handleQueryChange, results, searching, searchError, search, clearResults };
};
