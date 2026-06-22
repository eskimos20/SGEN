import { useState, useEffect, useCallback, useRef } from 'react';
import { Camera, ChevronLeft, ChevronRight, ImageOff, X, ZoomIn, ZoomOut, Maximize2, Play } from 'lucide-react';
import Hls from 'hls.js';
import api from '../../api/axios';

const HlsVideo = ({ src, poster, style, className, autoPlay = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (src.includes('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
        if (autoPlay) hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
        return () => hls.destroy();
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        if (autoPlay) video.play().catch(() => {});
      }
    } else {
      video.src = src;
      if (autoPlay) video.play().catch(() => {});
    }
  }, [src, autoPlay]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      controls
      playsInline
      style={style}
      className={className}
    />
  );
};

const PhotoLightbox = ({ photos, startIndex, getImageUrl, getVideoUrl, onClose }) => {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);
  const pinchStart = useRef(null);
  const imgRef = useRef(null);

  const resetZoom = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  const isLightboxVideo = (item) => {
    if (!item) return false;
    const mt = item.media_type;
    return mt === 2 || mt === '2' || mt === 'video' || item.video_url != null;
  };

  const navigate = useCallback((dir) => {
    resetZoom();
    setIndex(i => (i + dir + photos.length) % photos.length);
  }, [photos.length]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setScale(s => Math.min(5, Math.max(1, s - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = (e) => {
    if (scale <= 1) return;
    setDragging(true);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  const handleMouseMove = (e) => {
    if (!dragging || !dragStart.current) return;
    setOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };

  const handleMouseUp = () => setDragging(false);

  const touchDistance = (touches) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinchStart.current = { dist: touchDistance(e.touches), scale };
      setDragging(false);
    } else if (e.touches.length === 1 && scale > 1) {
      setDragging(true);
      dragStart.current = { x: e.touches[0].clientX - offset.x, y: e.touches[0].clientY - offset.y };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchStart.current) {
      const ratio = touchDistance(e.touches) / pinchStart.current.dist;
      setScale(Math.min(5, Math.max(1, pinchStart.current.scale * ratio)));
    } else if (e.touches.length === 1 && dragging && dragStart.current) {
      setOffset({ x: e.touches[0].clientX - dragStart.current.x, y: e.touches[0].clientY - dragStart.current.y });
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) pinchStart.current = null;
    if (e.touches.length === 0) {
      setDragging(false);
      if (scale <= 1) setOffset({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/90"
      style={{ zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Close */}
      <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
        <X className="h-6 w-6" />
      </button>

      {/* Counter */}
      {photos.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm bg-black/40 px-3 py-1 rounded-full z-10">
          {index + 1} / {photos.length}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        <button onClick={() => setScale(s => Math.max(1, s - 0.5))} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <ZoomOut className="h-5 w-5" />
        </button>
        <button onClick={resetZoom} className="px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm transition-colors">
          {Math.round(scale * 100)}%
        </button>
        <button onClick={() => setScale(s => Math.min(5, s + 0.5))} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <ZoomIn className="h-5 w-5" />
        </button>
      </div>

      {/* Prev */}
      {photos.length > 1 && (
        <button onClick={() => navigate(-1)} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}

      {/* Image / Video */}
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onWheel={!isLightboxVideo(photos[index]) ? handleWheel : undefined}
        onMouseDown={!isLightboxVideo(photos[index]) ? handleMouseDown : undefined}
        onMouseMove={!isLightboxVideo(photos[index]) ? handleMouseMove : undefined}
        onMouseUp={!isLightboxVideo(photos[index]) ? handleMouseUp : undefined}
        onMouseLeave={!isLightboxVideo(photos[index]) ? handleMouseUp : undefined}
        onTouchStart={!isLightboxVideo(photos[index]) ? handleTouchStart : undefined}
        onTouchMove={!isLightboxVideo(photos[index]) ? handleTouchMove : undefined}
        onTouchEnd={!isLightboxVideo(photos[index]) ? handleTouchEnd : undefined}
        style={{
          cursor: !isLightboxVideo(photos[index]) && scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
          touchAction: !isLightboxVideo(photos[index]) ? 'none' : undefined,
        }}
      >
        {isLightboxVideo(photos[index]) ? (
          <HlsVideo
            src={getVideoUrl(photos[index])}
            poster={getImageUrl(photos[index])}
            autoPlay
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
          />
        ) : (
          <img
            ref={imgRef}
            src={getImageUrl(photos[index])}
            alt={`Media ${index + 1}`}
            draggable={false}
            style={{
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
              transition: dragging ? 'none' : 'transform 0.15s ease',
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              userSelect: 'none',
            }}
          />
        )}
      </div>

      {/* Next */}
      {photos.length > 1 && (
        <button onClick={() => navigate(1)} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
          <ChevronRight className="h-7 w-7" />
        </button>
      )}
    </div>
  );
};

const StravaMedia = ({ activity, preFetchedData }) => {
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [found, setFound] = useState(false);
  const [hasStravaToken, setHasStravaToken] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Check if user has Strava connection
  useEffect(() => {
    const checkStravaConnection = async () => {
      try {
        const response = await api.get('/user/me');
        setHasStravaToken(response.data.hasStravaToken || false);
      } catch (err) {
        setHasStravaToken(false);
      }
    };
    checkStravaConnection();
  }, []);

  useEffect(() => {
    // Use pre-fetched data if available
    if (preFetchedData) {
      if (preFetchedData.found && preFetchedData.photos) {
        const mediaList = Array.isArray(preFetchedData.photos) 
          ? preFetchedData.photos 
          : [];
        setMediaItems(mediaList);
        setFound(true);
      } else {
        setMediaItems([]);
        setFound(preFetchedData.found || false);
      }
      
      return;
    }
    
    // Wait for token check to complete before fetching
    // hasStravaToken will be null initially while checking
    if (hasStravaToken === null || !hasStravaToken || !activity?.start_date) {
      return;
    }

    const fetchMedia = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Convert ISO date to Unix timestamp (seconds)
        const startDate = Math.floor(new Date(activity.start_date).getTime() / 1000);
        
        // Search for Strava activity by date and get photos
        const response = await api.get('/strava/photos/by-date', {
          params: {
            startDate,
            toleranceSeconds: 300 // 5 minute tolerance
          }
        });

        if (response.data.found && response.data.photos) {
          const mediaList = Array.isArray(response.data.photos) 
            ? response.data.photos 
            : [];
          setMediaItems(mediaList);
          setFound(true);
        } else {
          setMediaItems([]);
          setFound(response.data.found || false);
        }
      } catch (err) {
        // Check for rate limit error
        if (err.response?.status === 429) {
          const retryAfter = err.response?.data?.retryAfterFormatted || '15 minutes';
          setError({
            type: 'rate_limit',
            message: `Strava API rate limit exceeded. Try again in ${retryAfter}.`,
            retryAfter
          });
        } else {
          setError({ type: 'generic', message: 'Failed to load media' });
        }
        setMediaItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMedia();
  }, [activity, hasStravaToken, preFetchedData]);

  // Don't render anything if no Strava connection (but allow pre-fetched data to show)
  if (!hasStravaToken && !preFetchedData) {
    return null;
  }

  if (mediaItems.length === 0) return null;

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? mediaItems.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === mediaItems.length - 1 ? 0 : prev + 1));
  };

  const currentItem = mediaItems[currentIndex];

  // Get the best available image URL
  const getImageUrl = (photo) => {
    if (!photo) return null;
    return photo.urls?.['2048'] || 
           photo.urls?.['1024'] || 
           photo.urls?.['512'] || 
           photo.url || 
           photo.thumbnail_url;
  };

  const isVideo = (item) => {
    if (!item) return false;
    const mt = item.media_type;
    if (mt === 2 || mt === '2' || mt === 'video') return true;
    if (item.video_url) return true;
    if (item.urls && Object.values(item.urls).some(u => typeof u === 'string' && (u.includes('.m3u8') || u.includes('.mp4')))) return true;
    return false;
  };

  const getVideoUrl = (item) => {
    if (!item) return null;
    if (item.video_url) return item.video_url;
    if (item.urls) {
      const m3u8 = Object.values(item.urls).find(u => typeof u === 'string' && u.includes('.m3u8'));
      if (m3u8) return m3u8;
      return item.urls['0'] || item.urls['360'] || item.urls['720'];
    }
    return null;
  };

  return (
    <div className="bg-white sm:rounded-lg sm:shadow-sm p-2 sm:p-3">
      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
        <Camera className="h-4 w-4" />
        Media from Strava
        {mediaItems.length > 0 && (
          <span className="text-sm text-gray-500 font-normal ml-auto">
            {currentIndex + 1} / {mediaItems.length}
          </span>
        )}
      </h4>

      {loading && (
        <div className="flex items-center justify-center h-48 bg-gray-50 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-48 bg-gray-50 rounded-lg text-gray-400">
          <ImageOff className="h-8 w-8 mb-2" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && mediaItems.length === 0 && found && (
        <div className="flex flex-col items-center justify-center h-32 bg-gray-50 rounded-lg text-gray-400">
          <ImageOff className="h-6 w-6 mb-1" />
          <p className="text-sm">No media for this activity</p>
          <p className="text-xs text-gray-300 mt-1">Strava activity found but no media</p>
        </div>
      )}

      {!loading && !error && mediaItems.length === 0 && !found && (
        <div className="flex flex-col items-center justify-center h-32 bg-gray-50 rounded-lg text-gray-400">
          <ImageOff className="h-6 w-6 mb-1" />
          <p className="text-sm">No matching Strava activity found</p>
          <p className="text-xs text-gray-300 mt-1">Could not find Strava activity for this date</p>
        </div>
      )}

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={mediaItems}
          startIndex={lightboxIndex}
          getImageUrl={getImageUrl}
          getVideoUrl={getVideoUrl}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {!loading && !error && mediaItems.length > 0 && (
        <div className="relative">
          {/* Main Photo / Video */}
          <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
            {isVideo(currentItem) ? (
              <HlsVideo
                src={getVideoUrl(currentItem)}
                poster={getImageUrl(currentItem)}
                className="w-full h-full object-contain"
              />
            ) : (
              <>
                <img
                  src={getImageUrl(currentItem)}
                  alt={`Activity media ${currentIndex + 1}`}
                  className="w-full h-full object-contain cursor-zoom-in"
                  loading="lazy"
                  onClick={() => !isVideo(currentItem) && setLightboxIndex(currentIndex)}
                />
                <button
                  onClick={() => !isVideo(currentItem) && setLightboxIndex(currentIndex)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
                  aria-label="View full screen"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </>
            )}
            
            {/* Navigation Arrows */}
            {mediaItems.length > 1 && (
              <>
                <button
                  onClick={goToPrevious}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={goToNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {/* Thumbnail Navigation */}
          {mediaItems.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {mediaItems.map((photo, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                    idx === currentIndex 
                      ? 'border-orange-500' 
                      : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <img
                    src={photo.urls?.['128'] || photo.thumbnail_url || getImageUrl(photo)}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {photo.media_type === 2 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play className="h-5 w-5 text-white fill-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StravaMedia;
