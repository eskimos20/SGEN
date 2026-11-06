import React, { useState, useEffect } from 'react';
import { Loader2, Save, CheckCircle, Zap } from 'lucide-react';
import api from '../../api/axios';

/**
 * Zwift connection settings — enable toggle, credentials, save and test.
 * Owns its own state; initial values come from the profile load.
 */
const ZwiftConfigCard = ({ initialEnabled = false, initialUsername = '', initialHasConfig = false }) => {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState(initialHasConfig ? '••••••••••••••••' : '');
  const [hasConfig, setHasConfig] = useState(initialHasConfig);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Profile data arrives async — re-sync when the initial props settle
  useEffect(() => {
    setEnabled(initialEnabled);
    setUsername(initialUsername);
    setHasConfig(initialHasConfig);
    if (initialHasConfig) setPassword('••••••••••••••••');
  }, [initialEnabled, initialUsername, initialHasConfig]);

  const toggle = async (on) => {
    try {
      setMessage({ type: '', text: '' });
      await api.post(on ? '/user/zwift/enable' : '/user/zwift/disable');
      setEnabled(on);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update Zwift settings' });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await api.put('/user/zwift', {
        zwiftUsername: username || undefined,
        zwiftPassword: password.includes('•') ? undefined : password,
      });
      setHasConfig(true);
      setMessage({ type: 'success', text: 'Zwift settings saved!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save Zwift settings' });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await api.post('/user/zwift/test', {
        username: username || undefined,
        password: password.includes('•') ? undefined : password,
      });
      if (response.data.success) {
        setHasConfig(true);
        setMessage({
          type: 'success',
          text: `Connected as ${response.data.name} — Zwift FTP: ${response.data.ftp} W`,
        });
      } else {
        setMessage({ type: 'error', text: response.data.message || 'Connection failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Connection failed. Check your credentials.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-5 w-5 text-orange-500" />
        <h2 className="text-lg font-semibold text-gray-900">Zwift</h2>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Connect your Zwift account to automatically push your indoor FTP to your Zwift profile whenever it is updated here.
      </p>

      <div className="space-y-4">
        {message.text && (
          <div className={`p-3 rounded-xl text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => toggle(!enabled)}
            className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border-2 transition-colors ${
              enabled ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className="font-medium text-gray-900">Enable Zwift Integration</span>
        </div>

        {enabled && (
          <div className="space-y-4">
            <div>
              <label htmlFor="zwiftUsername" className="block text-sm font-medium text-gray-700 mb-1">
                Zwift Username (email)
              </label>
              <input
                id="zwiftUsername"
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field max-w-md"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="zwiftPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Zwift Password
              </label>
              <input
                id="zwiftPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field max-w-md"
                placeholder={hasConfig ? "•••••••••••••••• (enter new to change)" : "Enter your Zwift password"}
              />
              <p className="text-xs text-gray-500 mt-1">
                Stored securely and only used to sign in to Zwift.
                {hasConfig && " Type a new value only if you want to change it."}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !username}
                className="btn-primary flex items-center justify-center gap-2 min-w-[150px]"
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Save className="h-5 w-5" />
                    Save Zwift Settings
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={testConnection}
                disabled={testing || !username}
                className="btn-secondary flex items-center justify-center gap-2 min-w-[150px]"
              >
                {testing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Test Connection
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ZwiftConfigCard);
