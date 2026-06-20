import { useState, useEffect, useRef } from 'react';
import { Brain, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../../api/axios';

// Metrics that have a defined target range on the backend. Only these are sent.
const ANALYZED_METRICS = ['kneeBDC', 'kneeTDC', 'hip', 'ankle', 'back', 'elbow'];

const AIAnalysis = ({ angles, ridingStyle, isVideoProcessing }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceTimer = useRef(null);
  const lastAnglesRef = useRef({});

  // Auto-generate analysis when we have sufficient angle data
  useEffect(() => {
    // Clear any pending analysis if video is still processing
    if (isVideoProcessing) {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      return;
    }

    if (!angles || Object.keys(angles).length === 0) {
      setAnalysis(null);
      setError(null);
      return;
    }

    // Check if we have enough valid angle data
    const validAngles = Object.entries(angles).filter(([key, value]) => 
      value !== null && value !== undefined && !isNaN(value)
    );

    // Require at least 4 valid angles to generate analysis
    if (validAngles.length < 4) {
      return;
    }

    // Check if angles have actually changed significantly (to prevent unnecessary re-analysis)
    const currentAnglesStr = JSON.stringify(angles);
    const lastAnglesStr = JSON.stringify(lastAnglesRef.current);
    
    if (currentAnglesStr === lastAnglesStr) {
      return; // No change, don't re-analyze
    }

    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Debounce analysis generation
    debounceTimer.current = setTimeout(() => {
      generateAnalysis();
      lastAnglesRef.current = { ...angles };
    }, 2000); // Wait 2 seconds after last angle update

    const generateAnalysis = async () => {
      setLoading(true);
      setError(null);

      try {
        // Send only metrics that have a real numeric value AND a backend range,
        // so the fit score is computed correctly and the backend never sees null.
        const payload = {};
        ANALYZED_METRICS.forEach((key) => {
          const value = angles[key];
          if (value !== null && value !== undefined && !isNaN(value)) {
            payload[key] = value;
          }
        });

        const response = await api.post('/bikefit/ai-analysis', {
          angles: payload,
          ridingStyle
        });

        setAnalysis(response.data.analysis);
      } catch (err) {
        setError(
          err.response?.data?.message || err.message || 'Failed to generate AI analysis'
        );
      } finally {
        setLoading(false);
      }
    };
  }, [angles, ridingStyle, isVideoProcessing]);

  const formatAnalysis = (text) => {
    return text.split('\n').map((line, index) => {
      if (line.startsWith('🚴‍♂️') || line.startsWith('📊') || line.startsWith('🎯') || line.startsWith('⚡')) {
        return <h3 key={index} className="font-bold text-lg mt-4 mb-2 text-gray-900">{line}</h3>;
      } else if (line.startsWith('✅')) {
        return <p key={index} className="text-green-600 font-medium mb-1">{line}</p>;
      } else if (line.startsWith('⚠️')) {
        return <p key={index} className="text-orange-600 font-medium mb-1">{line}</p>;
      } else if (line.startsWith('💡')) {
        return <p key={index} className="text-blue-600 mb-2 pl-4">{line}</p>;
      } else if (line.startsWith('🏆') || line.startsWith('👍') || line.startsWith('🚨')) {
        return <p key={index} className="text-gray-700 font-medium mb-2">{line}</p>;
      } else if (line.startsWith('1️⃣') || line.startsWith('2️⃣')) {
        return <p key={index} className="text-purple-600 font-medium mb-1">{line}</p>;
      } else if (line.startsWith('✨')) {
        return <p key={index} className="text-green-600 italic mb-1">{line}</p>;
      } else if (line.trim() === '') {
        return <br key={index} />;
      } else {
        return <p key={index} className="text-gray-600 mb-1">{line}</p>;
      }
    });
  };

  // Don't show AI analysis until video analysis is complete and video is not playing
  if (!angles || Object.keys(angles).length === 0) {
    return null;
  }

  // Hide completely if video is still processing or playing
  if (isVideoProcessing) {
    return null;
  }

  // Check if we have enough valid angle data
  const validAngles = Object.entries(angles).filter(([key, value]) => 
    value !== null && value !== undefined && !isNaN(value)
  );

  // Require at least 4 valid angles to show AI analysis
  if (validAngles.length < 4) {
    return null;
  }

  return (
    <div className="bg-white sm:rounded-lg border border-gray-200 p-3 sm:p-6 w-full">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">AI BikeFit Analysis</h3>

      {error ? (
        <div className="bg-red-50 border border-red-200 sm:rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      ) : loading ? (
        <div className="bg-purple-50 border border-purple-200 sm:rounded-lg p-3 sm:p-6">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
            <div className="text-center">
              <p className="text-purple-800 font-medium">AI is analyzing your bike fit...</p>
              <p className="text-purple-600 text-sm mt-1">Generating personalized recommendations based on your measurements</p>
            </div>
          </div>
        </div>
      ) : analysis ? (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 sm:rounded-lg p-3 sm:p-6">
          <div className="prose prose-sm max-w-none">
            {formatAnalysis(analysis)}
          </div>
          <div className="mt-4 pt-4 border-t border-purple-200">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>AI analysis based on your current measurements and {ridingStyle} riding style</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AIAnalysis;
