import { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import { CheckCircle, Loader2, Link2, Download } from 'lucide-react';
import ConnectionCard from '../profile/ConnectionCard';

/**
 * Garmin Connect OAuth connection card with anonymized-data consent gate.
 * The authorize URL is only issued after the user ticks the policy checkbox
 * (backend enforces consent:true before returning the URL).
 *
 * Uses the shared connection-card pattern: an On/Off toggle (soft
 * disconnect — tokens and local data stay, the app just stops treating
 * the user as Garmin-connected) and a trash can that fully disconnects
 * after confirmation.
 */
export default function GarminConnectCard() {
  const [status, setStatus] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [backfill, setBackfill] = useState(null); // {state, yearsDone, totalActivities}

  const loadStatus = useCallback(async () => {
    try {
      const res = await api.get('/garmin/status');
      setStatus(res.data);
    } catch (e) {
      setStatus({ connected: false, oauthConfigured: false });
    }
  }, []);

  useEffect(() => {
    loadStatus().then(() => pollBackfill());
    const onMsg = (e) => {
      if (e.origin === window.location.origin && e.data?.type === 'GARMIN_AUTH_SUCCESS') {
        loadStatus().then(() => pollBackfill());
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [loadStatus]);

  const connect = async () => {
    if (!consent) {
      setError('You must accept the data policy first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/garmin/connect-url', { consent: true });
      window.open(res.data.url, 'garminAuth', 'width=800,height=700');
    } catch (e) {
      setError(e.response?.data?.error === 'consent_required'
        ? 'You must accept the data policy first.'
        : 'Could not start the Garmin connection.');
    } finally {
      setBusy(false);
    }
  };

  const pollBackfill = async () => {
    try {
      const res = await api.get('/statistics/backfill-loads/status');
      setBackfill(res.data);
      if (res.data.state === 'RUNNING') {
        setTimeout(pollBackfill, 3000);
      }
    } catch (e) { /* ignore */ }
  };

  const startBackfill = async () => {
    setBackfill({ state: 'RUNNING', yearsDone: 0, totalActivities: 0 });
    try {
      await api.post('/statistics/backfill-loads');
      pollBackfill();
    } catch (e) {
      setBackfill({ state: 'ERROR', error: 'Could not start the import' });
    }
  };

  const toggle = async (on) => {
    try {
      setError('');
      await api.post('/garmin/enabled', { enabled: on });
      setStatus(prev => ({ ...prev, enabled: on }));
    } catch (e) {
      setError('Could not update the Garmin connection.');
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete('/garmin/disconnect');
      setConsent(false);
      setBackfill(null);
      await loadStatus();
    } catch (e) {
      setError('Could not disconnect.');
    }
  };

  if (!status) return null;
  if (status.oauthConfigured === false) {
    return (
      <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Garmin (direct connection)</h2>
        <p className="text-sm text-gray-500">Garmin OAuth is not configured on the server.</p>
      </div>
    );
  }

  const garminEnabled = status.enabled !== false;

  const badge = status.connected && garminEnabled ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
      <CheckCircle className="h-3 w-3" />
      Connected
    </span>
  ) : status.status === 'NEEDS_REAUTH' ? (
    <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      Reconnect required
    </span>
  ) : null;

  return (
    <ConnectionCard
      title="Garmin (direct connection)"
      name="Garmin"
      badge={badge}
      enabled={status.connected ? garminEnabled : true}
      onToggle={status.connected ? toggle : null}
      toggleLabel="Enable Garmin Integration"
      onDelete={status.connected ? handleDelete : null}
    >
      {status.connected ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Your Garmin account is connected. Data arrives automatically via Garmin Push.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-sm font-medium text-gray-800 mb-1">Historical data</p>
            <p className="text-xs text-gray-500 mb-2">
              Imports your existing activity history from Intervals.icu so your training
              load (CTL/ATL) is stored locally — runs in the background.
            </p>
            {backfill?.state === 'RUNNING' ? (
              <p className="text-sm text-blue-700 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing… {backfill.totalActivities} activities ({backfill.yearsDone} years)
              </p>
            ) : (
              <div className="space-y-2">
                {(backfill?.state === 'DONE' || (backfill?.importedActivities || 0) > 0) && (
                  <p className="text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Synced — {Math.max(backfill?.totalActivities || 0, backfill?.importedActivities || 0)} imported · {backfill?.garminActivities || 0} via Garmin push
                  </p>
                )}
                <button
                  onClick={startBackfill}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-700 text-white hover:bg-gray-800"
                >
                  <Download className="h-4 w-4" /> {(backfill?.importedActivities || 0) > 0 ? 'Re-import historical data' : 'Import historical data'}
                </button>
              </div>
            )}
            {backfill?.state === 'ERROR' && (
              <p className="text-sm text-red-600 mt-1">{backfill.error}</p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Connect your Garmin Connect account to receive activities and wellness
            data — directly, without Intervals.icu.
          </p>

          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none bg-gray-50 border border-gray-200 rounded-lg p-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 flex-shrink-0"
            />
            <span>
              I agree that SGEN stores my training and health data to display
              statistics and calculations in the app. Data is stored <strong>anonymized</strong> —
              no personal details (name, email, etc.) are saved. I can disconnect
              at any time, which deletes my Garmin data.
            </span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={connect}
            disabled={busy || !consent}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Connect Garmin
          </button>
        </div>
      )}
    </ConnectionCard>
  );
}
