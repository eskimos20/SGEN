import { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import { CheckCircle, Loader2, Link2, Unlink, Download } from 'lucide-react';

/**
 * Garmin Connect OAuth connection card with anonymized-data consent gate.
 * The authorize URL is only issued after the user ticks the policy checkbox
 * (backend enforces consent:true before returning the URL).
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
    loadStatus();
    const onMsg = (e) => {
      if (e.origin === window.location.origin && e.data?.type === 'GARMIN_AUTH_SUCCESS') {
        loadStatus();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [loadStatus]);

  const connect = async () => {
    if (!consent) {
      setError('Du måste godkänna datapolicyn först.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/garmin/connect-url', { consent: true });
      window.open(res.data.url, 'garminAuth', 'width=800,height=700');
    } catch (e) {
      setError(e.response?.data?.error === 'consent_required'
        ? 'Du måste godkänna datapolicyn först.'
        : 'Kunde inte starta Garmin-anslutningen.');
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
      setBackfill({ state: 'ERROR', error: 'Kunde inte starta hämtningen' });
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Koppla bort Garmin? Din lokala Garmin-data raderas.')) return;
    setBusy(true);
    try {
      await api.delete('/garmin/disconnect');
      setConsent(false);
      await loadStatus();
    } catch (e) {
      setError('Kunde inte koppla bort.');
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;
  if (status.oauthConfigured === false) {
    return (
      <div className="card-mobile p-3 sm:p-4 border border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">Garmin (direktanslutning)</h2>
        <p className="text-sm text-gray-500 mt-1">Garmin OAuth är inte konfigurerat på servern.</p>
      </div>
    );
  }

  return (
    <div className="card-mobile p-3 sm:p-4 border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900">Garmin (direktanslutning)</h2>
          {status.connected && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
              <CheckCircle className="h-3 w-3" />
              Connected
            </span>
          )}
          {status.status === 'NEEDS_REAUTH' && (
            <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              Behöver kopplas om
            </span>
          )}
        </div>
      </div>

      {status.connected ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Ditt Garmin-konto är anslutet. Data flödar in automatiskt via Garmin Push.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-sm font-medium text-gray-800 mb-1">Historisk data</p>
            <p className="text-xs text-gray-500 mb-2">
              Hämtar äldre aktivitetsdata från Intervals.icu så din historik (CTL/ATL)
              finns lagrad lokalt — körs i bakgrunden utan att belasta Intervals.
            </p>
            {backfill?.state === 'RUNNING' ? (
              <p className="text-sm text-blue-700 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Hämtar… {backfill.totalActivities} aktiviteter ({backfill.yearsDone} år)
              </p>
            ) : backfill?.state === 'DONE' ? (
              <p className="text-sm text-green-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Klar — {backfill.totalActivities} aktiviteter importerade
              </p>
            ) : (
              <button
                onClick={startBackfill}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-700 text-white hover:bg-gray-800"
              >
                <Download className="h-4 w-4" /> Hämta historisk data
              </button>
            )}
            {backfill?.state === 'ERROR' && (
              <p className="text-sm text-red-600 mt-1">{backfill.error}</p>
            )}
          </div>

          <button
            onClick={disconnect}
            disabled={busy}
            className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            <Unlink className="h-4 w-4" /> Koppla bort Garmin
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Anslut ditt Garmin Connect-konto för att ta emot aktiviteter, wellness-data
            och skicka planerade pass — direkt, utan Intervals.icu.
          </p>

          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none bg-gray-50 border border-gray-200 rounded-lg p-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 flex-shrink-0"
            />
            <span>
              Jag godkänner att SGEN lagrar min tränings- och hälsodata för att visa
              statistik och beräkningar i appen. Datan lagras <strong>anonymiserat</strong> —
              inga personuppgifter (namn, e-post m.m.) sparas. Jag kan koppla bort
              när som helst, varvid min Garmin-data raderas.
            </span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={connect}
            disabled={busy || !consent}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Anslut Garmin
          </button>
        </div>
      )}
    </div>
  );
}
