import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Loader2 } from 'lucide-react';

const DebugTab = () => {
  const [dumpStreams, setDumpStreams] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await api.get('/admin/settings/debug');
      setDumpStreams(response.data.dumpActivityStreams);
    } catch (err) {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  const toggleDumpStreams = async (enabled) => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      await api.post('/admin/settings/debug/dump-streams', { enabled });
      setDumpStreams(enabled);
      setMessage({ 
        type: 'success', 
        text: `Activity stream dump ${enabled ? 'enabled' : 'disabled'}. Files will be saved to activity-data/ folder.` 
      });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update setting' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="card max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Debug Settings</h2>

      {message.text && (
        <div className={`p-3 rounded-lg text-sm mb-4 ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <div
            onClick={() => !saving && toggleDumpStreams(!dumpStreams)}
            className={`w-5 h-5 mt-0.5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
              dumpStreams ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
            } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {dumpStreams && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div>
            <span className="font-medium text-gray-900">Dump Activity Streams</span>
            <p className="text-sm text-gray-600 mt-1">
              When enabled, saves activity stream data (time, watts, heartrate) to JSON files 
              in the <code className="bg-gray-100 px-1 rounded">activity-data/</code> folder 
              when fetching data from Intervals.icu. Useful for debugging FTP/VO2Max calculations.
            </p>
          </div>
        </div>

        {dumpStreams && (
          <div className="bg-amber-50 text-amber-700 p-3 sm:p-4 sm:rounded-lg">
            <p className="font-medium">Stream dump is active</p>
            <p className="text-sm mt-1">
              Activity data will be saved to <code className="bg-amber-100 px-1 rounded">activity-data/</code> 
              folder next time you fetch data from Intervals.icu.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugTab;
