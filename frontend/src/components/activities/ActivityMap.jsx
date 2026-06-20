import { useEffect, useRef } from 'react';
import L from 'leaflet';
import '../../assets/leaflet-clean.css';

const ActivityMap = ({ mapData, className = "h-64" }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapData?.latlngs || !Array.isArray(mapData.latlngs) || mapData.latlngs.length === 0) return;
    if (!mapRef.current) return;

    // Filter out null/invalid points
    const validPoints = mapData.latlngs.filter(point => 
      point && Array.isArray(point) && point.length >= 2 && 
      typeof point[0] === 'number' && typeof point[1] === 'number'
    );
    
    if (validPoints.length === 0) return;

    // Clean up existing map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Create map
    const map = L.map(mapRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
      dragging: true,
    });

    mapInstanceRef.current = map;

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Create polyline from GPS coordinates
    const coordinates = validPoints.map(point => [point[0], point[1]]);
    
    const polyline = L.polyline(coordinates, {
      color: '#3b82f6',
      weight: 3,
      opacity: 0.8,
      smoothFactor: 1,
    }).addTo(map);

    // Add start marker (green)
    if (coordinates.length > 0) {
      L.circleMarker(coordinates[0], {
        radius: 8,
        fillColor: '#22c55e',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(map).bindPopup('Start');
    }

    // Add end marker (red)
    if (coordinates.length > 1) {
      L.circleMarker(coordinates[coordinates.length - 1], {
        radius: 8,
        fillColor: '#ef4444',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(map).bindPopup('Finish');
    }

    // Fit map to route bounds
    map.fitBounds(polyline.getBounds(), { padding: [20, 20] });

    // Handle resize to ensure map renders correctly when container changes
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        setTimeout(() => {
          mapInstanceRef.current.invalidateSize();
          mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [20, 20] });
        }, 100);
      }
    });
    
    resizeObserver.observe(mapRef.current);

    // Cleanup on unmount
    return () => {
      resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapData]);

  if (!mapData?.latlngs || mapData.latlngs.length === 0) {
    return null;
  }

  return (
    <div 
      ref={mapRef} 
      className={`${className} rounded-lg overflow-hidden w-full`}
      style={{ minHeight: '200px' }}
    />
  );
};

export default ActivityMap;
