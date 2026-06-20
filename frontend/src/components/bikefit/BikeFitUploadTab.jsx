import { Upload, Info } from 'lucide-react';

const BikeFitUploadTab = ({ onFileUpload }) => {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && onFileUpload) {
      onFileUpload(file);
    }
  };

  return (
    <div className="space-y-4">
      {/* Video Recording Tips */}
      <div className="bg-blue-50 border border-blue-200 sm:rounded-lg p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">📹 Video Recording Tips</h3>
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
      
      <div className="border-2 border-dashed border-gray-300 sm:rounded-lg p-4 sm:p-12 text-center hover:border-blue-500 transition-colors">
        <Upload className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-gray-400 mb-3 sm:mb-4" />
        <p className="text-base sm:text-lg font-medium text-gray-900 mb-2">Upload a video</p>
        <p className="text-xs sm:text-sm text-gray-600 mb-4">
          Choose a video file of your cycling position
        </p>
        <input
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
          id="video-upload"
        />
        <label
          htmlFor="video-upload"
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
        >
          Choose File
        </label>
      </div>
    </div>
  );
};

export default BikeFitUploadTab;
