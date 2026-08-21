import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Play, Pause } from 'lucide-react';
import '../../../assets/leaflet-clean.css';

const LIBREWXR_API = import.meta.env.VITE_LIBREWXR_API_URL || 'https://api.librewxr.net/public/weather-maps.json';

const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
};

const frameUrl = (host, frame) => `${host}${frame.path}/256/{z}/{x}/{y}/10/1_1.png`;

const WeatherRadarMap = ({ latitude, longitude, cityName }) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const currentLayerRef = useRef(null);
    const pendingLayerRef = useRef(null);
    const pendingIndexRef = useRef(-1);
    const pendingLoadedRef = useRef(false);
    const autoPlayAfterLoadRef = useRef(false);
    const previousCityRef = useRef(null);
    const [frames, setFrames] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [host, setHost] = useState('https://api.librewxr.net');
    const [viewRevision, setViewRevision] = useState(0);

    const buildUrl = (index) => {
        const frame = frames[index];
        if (!frame) return '';
        return frameUrl(host, frame);
    };

    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            try {
                const res = await fetch(LIBREWXR_API);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const radarFrames = [
                    ...(data.radar?.past || []),
                    ...(data.radar?.nowcast || []),
                ];
                if (!radarFrames.length) throw new Error('No radar frames');
                if (isMounted) {
                    setHost(data.host || 'https://api.librewxr.net');
                    setFrames(radarFrames);
                    autoPlayAfterLoadRef.current = true;
                    setCurrentIndex(0);
                    setLoading(false);
                }
            } catch (err) {
                if (isMounted) {
                    setError(err.message);
                    setLoading(false);
                }
            }
        };
        fetchData();
        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        if (!mapRef.current || !latitude || !longitude || loading || frames.length === 0) return;
        if (mapInstanceRef.current) return;

        const map = L.map(mapRef.current, {
            center: [latitude, longitude],
            zoom: 6,
            zoomControl: true,
            scrollWheelZoom: true,
            dragging: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 12,
        }).addTo(map);

        L.circleMarker([latitude, longitude], {
            radius: 6,
            fillColor: '#3b82f6',
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 1,
        }).addTo(map).bindPopup(cityName || 'Location');

        mapInstanceRef.current = map;

        const resizeObserver = new ResizeObserver(() => {
            setTimeout(() => map.invalidateSize(), 100);
        });
        resizeObserver.observe(mapRef.current);

        return () => {
            resizeObserver.disconnect();
            map.remove();
            mapInstanceRef.current = null;
            currentLayerRef.current = null;
            pendingLayerRef.current = null;
            pendingIndexRef.current = -1;
            pendingLoadedRef.current = false;
        };
    }, [latitude, longitude, loading, frames, host, cityName]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || frames.length === 0) return;

        const url = buildUrl(currentIndex);
        if (!url) return;

        if (currentLayerRef.current && currentLayerRef.current._url === url) {
            if (autoPlayAfterLoadRef.current) {
                setIsPlaying(true);
                autoPlayAfterLoadRef.current = false;
            }
            return;
        }

        const startLayer = (newLayer, isPreloaded) => {
            const targetOpacity = 0.7;
            const fadeSteps = 12;
            const stepTime = 25;

            const onLayerReady = () => {
                const expectedUrl = buildUrl(currentIndex);
                if (newLayer._url !== expectedUrl) {
                    map.removeLayer(newLayer);
                    return;
                }

                if (autoPlayAfterLoadRef.current) {
                    setIsPlaying(true);
                    autoPlayAfterLoadRef.current = false;
                }

                const oldLayer = currentLayerRef.current;
                if (!oldLayer) {
                    newLayer.setOpacity(targetOpacity);
                    currentLayerRef.current = newLayer;
                    return;
                }

                let step = 0;
                const fade = setInterval(() => {
                    step++;
                    const newOpacity = targetOpacity * (step / fadeSteps);
                    const oldOpacity = targetOpacity * (1 - step / fadeSteps);
                    newLayer.setOpacity(newOpacity);
                    oldLayer.setOpacity(oldOpacity);
                    if (step >= fadeSteps) {
                        clearInterval(fade);
                        map.removeLayer(oldLayer);
                        currentLayerRef.current = newLayer;
                    }
                }, stepTime);
            };

            if (isPreloaded && pendingLoadedRef.current) {
                onLayerReady();
            } else {
                newLayer.once('load', onLayerReady);
            }

            const fallback = setTimeout(() => {
                if (currentLayerRef.current !== newLayer) {
                    onLayerReady();
                }
            }, 3000);

            return () => {
                clearTimeout(fallback);
                newLayer.off('load', onLayerReady);
            };
        };

        if (pendingLayerRef.current && pendingIndexRef.current === currentIndex) {
            const newLayer = pendingLayerRef.current;
            pendingLayerRef.current = null;
            pendingIndexRef.current = -1;
            pendingLoadedRef.current = false;
            startLayer(newLayer, true);
            return;
        }

        if (pendingLayerRef.current) {
            map.removeLayer(pendingLayerRef.current);
            pendingLayerRef.current = null;
            pendingIndexRef.current = -1;
            pendingLoadedRef.current = false;
        }

        const newLayer = L.tileLayer(url, { opacity: 0, attribution: '' });
        newLayer.addTo(map);
        const cleanup = startLayer(newLayer, false);

        return () => {
            cleanup();
            if (currentLayerRef.current !== newLayer) {
                map.removeLayer(newLayer);
            }
        };
    }, [currentIndex, frames, host, viewRevision]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || frames.length === 0) return;

        const nextIndex = (currentIndex + 1) % frames.length;
        if (nextIndex === currentIndex) return;
        if (pendingLayerRef.current && pendingIndexRef.current === nextIndex) return;

        if (pendingLayerRef.current) {
            map.removeLayer(pendingLayerRef.current);
        }

        const nextFrame = frames[nextIndex];
        const layer = L.tileLayer(
            frameUrl(host, nextFrame),
            { opacity: 0, attribution: '' }
        );

        pendingLayerRef.current = layer;
        pendingIndexRef.current = nextIndex;
        pendingLoadedRef.current = false;

        layer.once('load', () => {
            if (pendingLayerRef.current === layer) {
                pendingLoadedRef.current = true;
            }
        });

        layer.addTo(map);

        return () => {
            if (pendingLayerRef.current === layer) {
                pendingLayerRef.current = null;
                pendingIndexRef.current = -1;
                pendingLoadedRef.current = false;
            }
        };
    }, [currentIndex, frames, host, viewRevision]);

    useEffect(() => {
        if (!isPlaying) return;
        const interval = setInterval(() => {
            setCurrentIndex((prev) => {
                const next = prev + 1;
                return next >= frames.length ? 0 : next;
            });
        }, 900);
        return () => clearInterval(interval);
    }, [isPlaying, frames.length]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (map && latitude && longitude) {
            map.setView([latitude, longitude], 6, { animate: false });
        }

        if (previousCityRef.current && previousCityRef.current !== cityName) {
            if (frames.length > 0) {
                setIsPlaying(false);
                autoPlayAfterLoadRef.current = true;

                if (currentLayerRef.current) {
                    map.removeLayer(currentLayerRef.current);
                    currentLayerRef.current = null;
                }
                if (pendingLayerRef.current) {
                    map.removeLayer(pendingLayerRef.current);
                    pendingLayerRef.current = null;
                    pendingIndexRef.current = -1;
                    pendingLoadedRef.current = false;
                }

                setCurrentIndex(0);
                setViewRevision((v) => v + 1);
            }
        }
        previousCityRef.current = cityName;
    }, [latitude, longitude, cityName, frames.length]);

    if (loading) {
        return (
            <div className="h-80 sm:h-96 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-80 sm:h-96 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center p-4">
                <p className="text-gray-500 text-sm text-center">Could not load radar images: {error}</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div ref={mapRef} className="h-80 sm:h-96 w-full relative z-0" />
            <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center gap-3">
                <button
                    onClick={() => setIsPlaying((v) => !v)}
                    className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex-shrink-0"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <input
                    type="range"
                    min={0}
                    max={frames.length - 1}
                    value={currentIndex}
                    onChange={(e) => {
                        setIsPlaying(false);
                        setCurrentIndex(Number(e.target.value));
                    }}
                    className="flex-1 accent-blue-600"
                />
                <span className="text-sm text-gray-700 w-16 text-right font-medium">
                    {formatTime(frames[currentIndex]?.time)}
                </span>
            </div>
        </div>
    );
};

export default WeatherRadarMap;
