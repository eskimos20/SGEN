import { useState, useEffect } from 'react';
import { Save, Loader2, Sparkles, ChevronDown, CheckCircle } from 'lucide-react';
import api from '../../api/axios';
import ConnectionCard, { ConnectedBadge } from './ConnectionCard';

/**
 * OpenAI connection — API key + model picker with the shared card pattern:
 * enable toggle, one "Save Settings" button that saves AND tests, trash can.
 * Self-contained: fetches its own config on mount.
 */
const OpenAIConfigCard = () => {
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [hasConfig, setHasConfig] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [models, setModels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await api.get('/user/openai/config');
      const cfg = res.data || {};
      setEnabled(!!cfg.enabled);
      setHasConfig(!!cfg.apiKey);
      setApiKey(cfg.apiKey || '');
      setSelectedModel(cfg.selectedModel || '');
      setConnectionTested(!!cfg.connectionTested);
    } catch (err) { /* ignore */ }
  };

  const toggle = async (on) => {
    try {
      setMessage({ type: '', text: '' });
      await api.post(on ? '/user/openai/enable' : '/user/openai/disable');
      setEnabled(on);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update OpenAI settings' });
    }
  };

  // Save Settings = persist the API key AND verify the connection. The
  // profile PUT writes the key even when the test fails; the test
  // endpoint then verifies the stored key (masked input falls back).
  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      if (!apiKey.includes('•')) {
        await api.put('/user/profile', { openaiApiKey: apiKey });
      }
      const res = await api.post('/user/openai/test', {});
      if (res.data.success) {
        setHasConfig(true);
        setConnectionTested(true);
        setApiKey('••••••••••••••••');
        setMessage({ type: 'success', text: 'Settings saved — connection verified!' });
      } else {
        setConnectionTested(false);
        setMessage({ type: 'error', text: 'Connection failed. Please check your API key.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Connection failed. Please check your API key.' });
    } finally {
      setSaving(false);
    }
  };

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const res = await api.get('/user/openai/models');
      setModels(res.data);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load models' });
    } finally {
      setLoadingModels(false);
    }
  };

  const selectModel = async (model) => {
    try {
      await api.post('/user/openai/model', { model });
      setSelectedModel(model);
      setMessage({ type: 'success', text: `Model "${model}" selected` });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to select model' });
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete('/user/openai');
      setEnabled(false);
      setApiKey('');
      setHasConfig(false);
      setConnectionTested(false);
      setSelectedModel('');
      setModels([]);
      setMessage({ type: '', text: '' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete OpenAI settings' });
    }
  };

  return (
    <ConnectionCard
      icon={Sparkles}
      iconColor="text-purple-600"
      title="OpenAI"
      name="OpenAI"
      badge={enabled && hasConfig && connectionTested ? <ConnectedBadge /> : null}
      enabled={enabled}
      onToggle={toggle}
      toggleLabel="Enable OpenAI Integration"
      onDelete={hasConfig ? handleDelete : null}
      description={<>Configure your own OpenAI API key to use AI features. Your API key is stored securely and used only for your requests. You can get an API key from <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">platform.openai.com</a>.</>}
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
          <label htmlFor="openaiKey" className="block text-sm font-medium text-gray-700 mb-1">
            OpenAI API Key
          </label>
          <input
            id="openaiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="input-field max-w-md"
            placeholder="sk-..."
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !apiKey}
            className="btn-primary flex items-center justify-center gap-2 min-w-[150px]"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            Save Settings
          </button>

          {connectionTested && (
            <button
              type="button"
              onClick={loadModels}
              disabled={loadingModels}
              className="btn-secondary flex items-center justify-center gap-2 min-w-[150px]"
            >
              {loadingModels ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Get AI Models
            </button>
          )}
        </div>

        {connectionTested && (
          <>
            {models.length > 0 && (
              <div>
                <label htmlFor="modelSelect" className="block text-sm font-medium text-gray-700 mb-1">
                  Select Model
                </label>
                <div className="relative">
                  <select
                    id="modelSelect"
                    value={selectedModel || ''}
                    onChange={(e) => selectModel(e.target.value)}
                    className="input-field appearance-none pr-10 max-w-md"
                  >
                    <option value="">Select a model...</option>
                    {models.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}

            {selectedModel && (
              <p className="text-sm text-green-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Using model: {selectedModel}
              </p>
            )}
          </>
        )}
      </div>
    </ConnectionCard>
  );
};

export default OpenAIConfigCard;
