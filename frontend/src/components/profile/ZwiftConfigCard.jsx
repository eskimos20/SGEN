import React, { useState, useEffect } from 'react';
import { Loader2, Save, Zap } from 'lucide-react';
import api from '../../api/axios';
import ConnectionCard, { ConnectedBadge } from './ConnectionCard';

/**
 * Zwift connection — enable toggle, credentials, and the shared card
 * pattern: one "Save Settings" button that saves AND tests (the backend
 * test endpoint persists credentials on success), plus a trash can.
 * Owns its own state; initial values come from the profile load.
 */
const ZwiftConfigCard = ({ initialEnabled = false, initialUsername = '', initialHasConfig = false }) => {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState(initialHasConfig ? '••••••••••••••••' : '');
  const [hasConfig, setHasConfig] = useState(initialHasConfig);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

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

  // Save Settings = persist credentials AND test the connection. The
  // profile PUT writes the values even when the sign-in check fails; the
  // test endpoint then verifies the stored credentials.
  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await api.put('/user/profile', {
        zwiftUsername: username || undefined,
        zwiftPassword: password.includes('•') ? undefined : password,
      });
      const response = await api.post('/user/zwift/test', {});
      if (response.data.success) {
        setHasConfig(true);
        setPassword('••••••••••••••••');
        setMessage({
          type: 'success',
          text: `Settings saved — connected as ${response.data.name} (Zwift FTP: ${response.data.ftp} W)`,
        });
      } else {
        setMessage({ type: 'error', text: response.data.message || 'Connection failed. Check your credentials.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save Zwift settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete('/user/zwift');
      setEnabled(false);
      setUsername('');
      setPassword('');
      setHasConfig(false);
      setMessage({ type: '', text: '' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete Zwift settings' });
    }
  };

  return (
    <ConnectionCard
      icon={Zap}
      iconColor="text-orange-500"
      title="Zwift"
      name="Zwift"
      badge={enabled && hasConfig ? <ConnectedBadge /> : null}
      enabled={enabled}
      onToggle={toggle}
      toggleLabel="Enable Zwift Integration"
      onDelete={hasConfig ? handleDelete : null}
      description="Connect your Zwift account to automatically push your indoor FTP to your Zwift profile whenever it is updated here."
    >
      <div className="space-y-4">
        {message.text && (
          <div className={`p-3 rounded-xl text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

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
            placeholder={hasConfig ? '•••••••••••••••• (enter new to change)' : 'Enter your Zwift password'}
          />
          <p className="text-xs text-gray-500 mt-1">
            Stored securely and only used to sign in to Zwift.
            {hasConfig && ' Type a new value only if you want to change it.'}
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
              <Save className="h-5 w-5" />
            )}
            Save Settings
          </button>
        </div>
      </div>
    </ConnectionCard>
  );
};

export default React.memo(ZwiftConfigCard);
