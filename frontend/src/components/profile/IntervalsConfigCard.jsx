import { useState, useEffect } from 'react';
import { Save, Loader2, Link2 } from 'lucide-react';
import api from '../../api/axios';
import ConnectionCard, { ConnectedBadge } from './ConnectionCard';
import IntervalsProviderSettings from './IntervalsProviderSettings';

/**
 * Intervals.icu connection — API key + athlete id with the shared
 * connection-card pattern: enable toggle (soft disconnect, keeps creds),
 * one "Save Settings" button that saves AND tests, and a trash can that
 * wipes the credentials.
 */
const IntervalsConfigCard = ({ initialEnabled = true, initialAthleteId = '', initialHasConfig = false }) => {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [apiKey, setApiKey] = useState(initialHasConfig ? '••••••••••••••••' : '');
  const [athleteId, setAthleteId] = useState(initialAthleteId);
  const [hasConfig, setHasConfig] = useState(initialHasConfig);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    setEnabled(initialEnabled);
    setAthleteId(initialAthleteId);
    setHasConfig(initialHasConfig);
    if (initialHasConfig) setApiKey('••••••••••••••••');
  }, [initialEnabled, initialAthleteId, initialHasConfig]);

  const refreshUser = async () => {
    const userResponse = await api.get('/user/me');
    if (userResponse.data) {
      window.dispatchEvent(new CustomEvent('userUpdated', { detail: userResponse.data }));
    }
  };

  const toggle = async (on) => {
    try {
      setMessage({ type: '', text: '' });
      await api.put('/user/profile', { intervalsEnabled: on });
      setEnabled(on);
      await refreshUser();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update Intervals.icu settings' });
    }
  };

  // Save Settings = persist the credentials, then test the connection —
  // a single button does both.
  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await api.put('/user/profile', {
        intervalsApiKey: apiKey.includes('•') ? undefined : apiKey,
        intervalsAthleteId: athleteId,
      });
      setHasConfig(true);
      await refreshUser();

      const test = await api.get('/user/intervals/test');
      if (test.data?.success) {
        setMessage({ type: 'success', text: 'Settings saved — connection verified!' });
      } else {
        setMessage({ type: 'error', text: 'Settings saved, but the connection test failed. Check your credentials.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete('/user/intervals');
      setEnabled(false);
      setApiKey('');
      setAthleteId('');
      setHasConfig(false);
      setMessage({ type: '', text: '' });
      await refreshUser();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete Intervals.icu settings' });
    }
  };

  return (
    <ConnectionCard
      icon={Link2}
      iconColor="text-blue-600"
      title="Intervals.icu"
      name="Intervals.icu"
      badge={enabled && hasConfig ? <ConnectedBadge /> : null}
      enabled={enabled}
      onToggle={toggle}
      toggleLabel="Enable Intervals.icu Integration"
      onDelete={hasConfig ? handleDelete : null}
      description="Enter your Intervals.icu API credentials to fetch your training data. You can find these in your Intervals.icu account under Settings → Developer Settings."
    >
      <div className="space-y-6">
        {message.text && (
          <div className={`p-3 rounded-xl text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <div>
          <label htmlFor="athleteId" className="block text-sm font-medium text-gray-700 mb-1">
            Athlete ID
          </label>
          <input
            id="athleteId"
            type="text"
            value={athleteId}
            onChange={(e) => setAthleteId(e.target.value)}
            className="input-field max-w-xs"
            placeholder="e.g., i443288"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            URL: intervals.icu/athlete/<strong>i443288</strong>
          </p>
        </div>

        <div>
          <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
            API Key
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="input-field max-w-xs"
            placeholder="Enter your API key"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Intervals.icu → Settings → Developer Settings
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !athleteId || !apiKey}
            className="btn-primary flex items-center justify-center gap-2 min-w-[150px]"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            Save Settings
          </button>
        </div>

        {/* Provider connections + sync toggles — Intervals.icu athlete
            profile settings, shown once credentials work. */}
        {hasConfig && <IntervalsProviderSettings />}
      </div>
    </ConnectionCard>
  );
};

export default IntervalsConfigCard;
