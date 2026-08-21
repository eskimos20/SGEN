import { Camera, Video, Info } from 'lucide-react';

const BikeFitRecordTab = ({
  stream,
  isRecording,
  availableCameras,
  selectedCamera,
  setSelectedCamera,
  cameraCapabilities,
  supportedCodecs,
  selectedResolution,
  setSelectedResolution,
  selectedFps,
  setSelectedFps,
  availableResolutions,
  availableFpsValues,
  countdown,
  recordingDuration,
  setRecordingDuration,
  recordingTime,
  startDelay,
  setStartDelay,
  startCamera,
  stopCamera,
  startRecording,
  stopRecording,
  videoRef
}) => {
  return (
    <div className="space-y-4">
      {/* Recording Tips */}
      <div className="bg-blue-50 border border-blue-200 sm:rounded-lg p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">📹 Recording Tips for Best Results</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>Pedal slowly:</strong> Use low resistance and maintain 40-50 RPM cadence</li>
              <li>• <strong>Camera position:</strong> Place camera perpendicular to bike, 2-3 meters away</li>
              <li>• <strong>Full body visible:</strong> Ensure shoulder to ankle is in frame</li>
              <li>• <strong>Good lighting:</strong> Well-lit area for better landmark detection</li>
              <li>• <strong>Complete 3-5 pedal strokes</strong> for accurate analysis</li>
            </ul>
          </div>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Camera
        </label>
        <select
          value={selectedCamera}
          onChange={(e) => setSelectedCamera(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={isRecording}
        >
          {availableCameras.map(camera => (
            <option key={camera.deviceId} value={camera.deviceId}>
              {camera.label || `Camera ${camera.deviceId.substring(0, 8)}`}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Resolution
          </label>
          <select
            value={selectedResolution}
            onChange={(e) => setSelectedResolution(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isRecording || availableResolutions.length === 0}
          >
            {availableResolutions.length > 0 ? (
              availableResolutions.map(res => (
                <option key={res.value} value={res.value}>
                  {res.label}
                </option>
              ))
            ) : (
              <option value="">No camera available</option>
            )}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Frame Rate
          </label>
          <select
            value={selectedFps}
            onChange={(e) => setSelectedFps(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isRecording || availableFpsValues.length === 0}
          >
            {availableFpsValues.length > 0 ? (
              availableFpsValues.map(fps => (
                <option key={fps.value} value={fps.value}>
                  {fps.label}
                </option>
              ))
            ) : (
              <option value="">No camera available</option>
            )}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Start Delay: {startDelay}s
          </label>
          <input
            type="range"
            min="10"
            max="60"
            value={startDelay}
            onChange={(e) => setStartDelay(parseInt(e.target.value))}
            className="w-full"
            disabled={isRecording}
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>10s</span>
            <span>60s</span>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Recording Duration: {recordingDuration}s
          </label>
          <input
            type="range"
            min="10"
            max="60"
            value={recordingDuration}
            onChange={(e) => setRecordingDuration(parseInt(e.target.value))}
            className="w-full"
            disabled={isRecording}
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>10s</span>
            <span>60s</span>
          </div>
        </div>
      </div>

      {cameraCapabilities && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Video className="h-4 w-4" />
            Camera Capabilities
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Max Resolution:</span>
              <span className="font-medium text-gray-900">{cameraCapabilities.maxResolution}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Max Frame Rate:</span>
              <span className="font-medium text-gray-900">{cameraCapabilities.maxFps} fps</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Available Codecs:</span>
              <span className="font-medium text-gray-900">{supportedCodecs.length} supported</span>
            </div>
            {supportedCodecs.map((codec, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-gray-600">{codec.name}:</span>
                <span className="font-medium text-gray-900">Available</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cameraCapabilities && stream && !isRecording && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Camera Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div>
              <span className="text-gray-600">Max Resolution:</span>
              <span className="ml-2 font-medium text-gray-900">{cameraCapabilities.maxResolution}</span>
            </div>
            <div>
              <span className="text-gray-600">Max Frame Rate:</span>
              <span className="ml-2 font-medium text-gray-900">{cameraCapabilities.maxFps} fps</span>
            </div>
            <div>
              <span className="text-gray-600">Selected Resolution:</span>
              <span className="ml-2 font-medium text-gray-900">{cameraCapabilities.resolution}</span>
            </div>
            <div>
              <span className="text-gray-600">Selected Frame Rate:</span>
              <span className="ml-2 font-medium text-gray-900">{cameraCapabilities.fps} fps</span>
            </div>
          </div>
        </div>
      )}

      <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        
        {countdown > 0 && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="text-white text-6xl font-bold">{countdown}</div>
          </div>
        )}
        
        {isRecording && countdown === 0 && (
          <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
            Recording: {recordingTime}s / {recordingDuration}s
          </div>
        )}
      </div>

      {!stream && (
        <div className="flex gap-2 sm:gap-3">
          <button
            onClick={startCamera}
            className="flex-1 sm:flex-initial px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors font-medium text-sm sm:text-base"
          >
            <Camera className="h-4 w-4 inline mr-2" />
            <span className="hidden xs:inline">Start Camera</span>
            <span className="xs:hidden">Start</span>
          </button>
        </div>
      )}
      {stream && !isRecording && (
        <div className="flex gap-2 sm:gap-3">
          <button
            onClick={startRecording}
            className="flex-1 px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm sm:text-base"
          >
            <Video className="h-4 w-4 inline mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Start Recording</span>
            <span className="xs:hidden">Record</span>
          </button>
          <button
            onClick={stopCamera}
            className="flex-1 px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium text-sm sm:text-base"
          >
            <Camera className="h-4 w-4 inline mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Stop Camera</span>
            <span className="xs:hidden">Stop</span>
          </button>
        </div>
      )}
      {isRecording && (
        <button
          onClick={stopRecording}
          className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium animate-pulse text-sm sm:text-base"
        >
          <Video className="h-4 w-4 inline mr-2" />
          <span className="hidden xs:inline">Stop Recording</span>
          <span className="xs:hidden">Stop</span>
        </button>
      )}
    </div>
  );
};

export default BikeFitRecordTab;
