import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Loader2, Save, CheckCircle } from 'lucide-react';

/**
 * Admin tab: Garmin Developer OAuth credentials (client id + secret).
 * Stored in app_settings — takes precedence over env vars.
 */
export default function GarminTab() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    api.get('/admin/settings/garmin').then(res => {
      setClientId(res.data.clientId || '');
      setHasSecret(res.data.hasSecret || false);
      if (res.data.hasSecret) setClientSecret('••••••••••••••••');
    }).catch(() => setMsg({ type: 'error', text: 'Kunde inte hämta Garmin-inställningar' }));
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      await api.post('/admin/settings/garmin', {
        clientId,
        clientSecret: clientSecret.includes('•') ? undefined : clientSecret,
      });
      setMsg({ type: 'success', text: 'Garmin-inställningar sparade' });
      setHasSecret(true);
      setClientSecret('••••••••••••••••');
    } catch (e) {
      setMsg({ type: 'error', text: 'Kunde inte spara' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Garmin OAuth</h2>
      <p className="text-sm text-gray-600">
        Client ID och Client Secret från Garmin Developer-portalen.
        Lagras i databasen och gäller direkt (env-variabler används som fallback).
      </p>

      {msg.text && (
        <div className={`p-3 rounded-lg text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="space-y-3 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Garmin app client ID"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
          <input
            type="password"
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder={hasSecret ? 'Sparad — ange ny för att byta' : 'Garmin app client secret'}
          />
        </div>
        <button
          onClick={save}
          disabled={saving || !clientId}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Spara
        </button>
      </div>
    </div>
  );
}
