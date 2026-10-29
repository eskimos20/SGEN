import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { CheckCircle2, Database, Loader2, Save, XCircle } from 'lucide-react';

const initialForm = { host: '', port: 3306, databaseName: 'eskimos_sgen_db', username: '', password: '' };

const DatabaseTab = () => {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [bootstrapMode, setBootstrapMode] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get('/admin/database')
      .then(({ data }) => {
        setBootstrapMode(data.bootstrapMode);
        setForm((current) => ({
          ...current,
          host: data.settings.host || '',
          port: data.settings.port || 3306,
          databaseName: data.settings.databaseName || data.defaultDatabaseName || 'eskimos_sgen_db',
          username: data.settings.username || '',
        }));
      })
      .catch(() => setMessage({ type: 'error', text: 'Kunde inte läsa databasinställningarna.' }))
      .finally(() => setLoading(false));
  }, []);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (action, event) => {
    event.preventDefault();
    setBusy(action);
    setMessage(null);
    setResult(null);
    try {
      const { data } = await api.post(action === 'test' ? '/admin/database/test' : '/admin/database', {
        ...form,
        port: Number(form.port),
      });
      if (action === 'test') {
        setResult(data);
        setMessage({ type: data.canConnectToDatabase ? 'success' : 'error', text: data.message });
      } else {
        setMessage({ type: 'success', text: data.message });
        setForm((current) => ({ ...current, password: '' }));
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Databasåtgärden misslyckades.' });
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>;
  }

  return (
    <div className="card-mobile max-w-3xl space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Database className="h-5 w-5" /> MySQL-databas
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Ange anslutningen till SGENs MySQL-server. Databasnamnet kan ändras; standardnamnet är <code>eskimos_sgen_db</code>.
          Lösenordet lagras lokalt på servern och visas aldrig här.
        </p>
      </div>

      {bootstrapMode && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Första uppstarten: logga in med <code>admin</code> / <code>password</code>. Endast databasinställningar är tillgängliga tills MySQL har sparats och SGEN startats om.
        </div>
      )}

      {message && (
        <div role="status" className={`rounded-lg p-3 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {result && result.serverOnline && result.databaseExists && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
          <div className="flex items-center gap-2">
            {result.canConnectToDatabase ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
            <span>MySQL svarar och databasen kan nås.</span>
          </div>
          <div>Hittade tabeller: {result.tableCount} av 15.</div>
          {result.missingTables?.length > 0 && (
            <p>Saknade tabeller skapas automatiskt när SGEN startas om: {result.missingTables.join(', ')}.</p>
          )}
        </div>
      )}

      <form onSubmit={(event) => submit('test', event)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            IP-adress eller värdnamn
            <input className="input-field mt-1 w-full" value={form.host} onChange={(event) => update('host', event.target.value)} placeholder="127.0.0.1" required />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Port
            <input className="input-field mt-1 w-full" type="number" min="1" max="65535" value={form.port} onChange={(event) => update('port', event.target.value)} required />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Databasnamn
            <input className="input-field mt-1 w-full" value={form.databaseName} onChange={(event) => update('databaseName', event.target.value)} required />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            MySQL-användare
            <input className="input-field mt-1 w-full" value={form.username} onChange={(event) => update('username', event.target.value)} autoComplete="username" required />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            MySQL-lösenord
            <input className="input-field mt-1 w-full" type="password" value={form.password} onChange={(event) => update('password', event.target.value)} autoComplete="new-password" required />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={Boolean(busy)} className="btn-secondary flex items-center gap-2">
            {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Testa anslutning
          </button>
          <button type="button" onClick={(event) => submit('save', event)} disabled={Boolean(busy)} className="btn-primary flex items-center gap-2">
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Spara anslutning
          </button>
        </div>
      </form>

      <p className="text-xs text-gray-500">
        När du sparar kontrolleras anslutningen. SGEN behöver sedan startas om för att använda den nya anslutningen.
        Om tabeller saknas skapas de vid uppstart. Befintliga tabeller och data uppdateras inte genom någon rensning.
      </p>
    </div>
  );
};

export default DatabaseTab;
