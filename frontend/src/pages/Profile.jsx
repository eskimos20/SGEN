import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { Save, CheckCircle, XCircle, Loader2, ChevronDown, Sparkles, ExternalLink } from 'lucide-react';
import { openStravaAuthPopup } from '../utils/stravaOAuth';

const Profile = () => {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [athleteId, setAthleteId] = useState('');
  const [hasCredentialsSaved, setHasCredentialsSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [connectionStatus, setConnectionStatus] = useState(null);

  // OpenAI state
  const [openaiConfig, setOpenaiConfig] = useState({ enabled: false, apiKey: '', selectedModel: '', connectionTested: false });
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiTesting, setOpenaiTesting] = useState(false);
  const [openaiMessage, setOpenaiMessage] = useState({ type: '', text: '' });
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Strava state
  const [stravaEnabled, setStravaEnabled] = useState(false);
  const [stravaClientId, setStravaClientId] = useState('');
  const [stravaClientSecret, setStravaClientSecret] = useState('');
  const [hasStravaConfig, setHasStravaConfig] = useState(false);
  const [hasStravaToken, setHasStravaToken] = useState(false);
  const [stravaAuthUrl, setStravaAuthUrl] = useState('');
  const [stravaMessage, setStravaMessage] = useState({ type: '', text: '' });
  const [testingStrava, setTestingStrava] = useState(false);
  const [exchangingStrava, setExchangingStrava] = useState(false);
  const [savingStrava, setSavingStrava] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await api.get('/user/me');
      if (response.data.hasIntervalsConfig) {
        setApiKey('••••••••••••••••');
        setAthleteId(response.data.intervalsAthleteId || '');
        setHasCredentialsSaved(true);
      }
      // Load OpenAI config
      await loadOpenAIConfig();
      // Load Strava config
      setStravaEnabled(response.data.stravaEnabled || false);
      if (response.data.hasStravaConfig) {
        setStravaClientId(response.data.stravaClientId || '');
        setStravaClientSecret('••••••••••••••••');
        setHasStravaConfig(true);
        setStravaAuthUrl(response.data.stravaAuthorizationUrl || '');
      }
      setHasStravaToken(response.data.hasStravaToken || false);
    } catch (err) {
      // Silently fail
    }
  };

  const loadOpenAIConfig = async () => {
    try {
      const response = await api.get('/user/openai/config');
      setOpenaiConfig(response.data);
      if (response.data.apiKey) {
        setOpenaiApiKey(response.data.apiKey);
      }
    } catch (err) {
      // Silently fail
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await api.put('/user/profile', {
        intervalsApiKey: apiKey.includes('•') ? undefined : apiKey,
        intervalsAthleteId: athleteId,
        stravaClientId: stravaClientId.includes('•') ? undefined : stravaClientId,
        stravaClientSecret: stravaClientSecret.includes('•') ? undefined : stravaClientSecret,
      });
      
      // Fetch updated user data to refresh context immediately
      const userResponse = await api.get('/user/me');
      if (userResponse.data) {
        // Update the auth context with new user data
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: userResponse.data }));
      }
      
      setMessage({ type: 'success', text: 'Profile saved successfully!' });
      setConnectionStatus(null);
      setHasCredentialsSaved(true);
      
      // Reload to get updated Strava auth URL
      await loadProfile();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save profile' });
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setConnectionStatus(null);

    try {
      const response = await api.get('/user/intervals/test');
      setConnectionStatus(response.data.success ? 'success' : 'error');
    } catch (err) {
      setConnectionStatus('error');
    } finally {
      setTesting(false);
    }
  };

  // OpenAI handlers
  const toggleOpenAI = async (enabled) => {
    try {
      setOpenaiMessage({ type: '', text: '' });
      if (enabled) {
        await api.post('/user/openai/enable');
        setOpenaiConfig({ ...openaiConfig, enabled: true });
      } else {
        await api.post('/user/openai/disable');
        setOpenaiConfig({ enabled: false, apiKey: '', selectedModel: '', connectionTested: false });
        setOpenaiApiKey('');
        setModels([]);
      }
    } catch (err) {
      setOpenaiMessage({ type: 'error', text: 'Failed to update OpenAI settings' });
    }
  };

  const testOpenAIConnection = async () => {
    setOpenaiTesting(true);
    setOpenaiMessage({ type: '', text: '' });

    try {
      const response = await api.post('/user/openai/test', { apiKey: openaiApiKey });
      if (response.data.success) {
        setOpenaiConfig({ ...openaiConfig, connectionTested: true, apiKey: openaiApiKey });
        setOpenaiMessage({ type: 'success', text: 'Connection successful! API key saved.' });
      } else {
        setOpenaiMessage({ type: 'error', text: 'Connection failed. Please check your API key.' });
      }
    } catch (err) {
      setOpenaiMessage({ type: 'error', text: 'Connection failed. Please check your API key.' });
    } finally {
      setOpenaiTesting(false);
    }
  };

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const response = await api.get('/user/openai/models');
      setModels(response.data);
    } catch (err) {
      setOpenaiMessage({ type: 'error', text: 'Failed to load models' });
    } finally {
      setLoadingModels(false);
    }
  };

  const selectModel = async (model) => {
    try {
      await api.post('/user/openai/model', { model });
      setOpenaiConfig({ ...openaiConfig, selectedModel: model });
      setOpenaiMessage({ type: 'success', text: `Model "${model}" selected` });
    } catch (err) {
      setOpenaiMessage({ type: 'error', text: 'Failed to select model' });
    }
  };

  // Build Strava auth URL dynamically based on current browser location
  const buildStravaAuthUrl = () => {
    if (!stravaClientId) return null;
    const protocol = window.location.protocol.replace(':', '');
    const host = window.location.host;
    const redirectUri = `${protocol}://${host}/api/strava/callback`;
    
    return `https://www.strava.com/oauth/authorize?` +
           `client_id=${encodeURIComponent(stravaClientId)}` +
           `&redirect_uri=${encodeURIComponent(redirectUri)}` +
           `&response_type=code` +
           `&scope=read,activity:read_all,profile:read_all`;
  };

  // Strava handlers
  const handleConnectStrava = async () => {
    if (!stravaClientId) {
      setStravaMessage({ type: 'error', text: 'Please save your Strava credentials first' });
      return;
    }
    
    const authUrl = buildStravaAuthUrl();
    if (!authUrl) {
      setStravaMessage({ type: 'error', text: 'Failed to build authorization URL' });
      return;
    }
    
    setExchangingStrava(true);
    setStravaMessage({ type: '', text: '' });
    
    try {
      const code = await openStravaAuthPopup(authUrl);
      
      // Exchange the code for tokens
      const response = await api.post('/strava/exchange-code', { code });
      
      if (response.data.success) {
        setHasStravaToken(true);
        setStravaMessage({ type: 'success', text: '✅ Strava connected successfully! Authorization completed automatically.' });
      } else {
        setStravaMessage({ type: 'error', text: 'Authorization failed. Please try again.' });
      }
    } catch (err) {
      if (err.message.includes('Popup blocked')) {
        setStravaMessage({ type: 'error', text: '⚠️ Popup blocked. Please allow popups for this site and try again.' });
      } else if (err.message.includes('cancelled')) {
        setStravaMessage({ type: 'warning', text: 'Authorization cancelled.' });
      } else {
        setStravaMessage({ type: 'error', text: `Failed to authorize: ${err.message}` });
      }
    } finally {
      setExchangingStrava(false);
    }
  };

  const testStravaConnection = async () => {
    setTestingStrava(true);
    setStravaMessage({ type: '', text: '' });

    try {
      const response = await api.get('/strava/test');
      if (response.data.success) {
        setStravaMessage({ type: 'success', text: `Connected as ${response.data.athleteName}` });
      } else {
        setStravaMessage({ type: 'error', text: 'Connection failed' });
      }
    } catch (err) {
      setStravaMessage({ type: 'error', text: 'Connection failed. Please reconnect.' });
    } finally {
      setTestingStrava(false);
    }
  };

  const handleSaveStrava = async () => {
    setSavingStrava(true);
    setStravaMessage({ type: '', text: '' });

    try {
      const payload = {
        stravaClientId: stravaClientId.includes('•') ? undefined : stravaClientId,
        stravaClientSecret: stravaClientSecret.includes('•') ? undefined : stravaClientSecret,
      };
      
      const response = await api.put('/user/profile', payload);

      // Fetch updated user data
      const userResponse = await api.get('/user/me');
      if (userResponse.data) {
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: userResponse.data }));
      }

      setHasStravaConfig(true);
      setStravaAuthUrl(userResponse.data.stravaAuthorizationUrl || '');
      setStravaMessage({ type: 'success', text: 'Strava settings saved! You can now connect.' });
    } catch (err) {
      setStravaMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save Strava settings' });
    } finally {
      setSavingStrava(false);
    }
  };

  const toggleStrava = async (enabled) => {
    try {
      setStravaMessage({ type: '', text: '' });
      if (enabled) {
        await api.post('/user/strava/enable');
        setStravaEnabled(true);
      } else {
        await api.post('/user/strava/disable');
        setStravaEnabled(false);
        setHasStravaToken(false);
        setStravaAuthUrl('');
      }
      // Refresh auth context with updated user data
      const userResponse = await api.get('/user/me');
      if (userResponse.data) {
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: userResponse.data }));
      }
    } catch (err) {
      setStravaMessage({ type: 'error', text: 'Failed to update Strava settings' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl sm:shadow-sm p-3 sm:p-6 border-b sm:border border-gray-200">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Profile Settings</h1>
          <p className="text-gray-600 mt-1">Manage your account, Intervals.icu and OpenAI integration</p>
        </div>

        {/* Intervals.icu Configuration */}
        <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Intervals.icu Configuration</h2>
        <p className="text-gray-600 text-sm mb-6">
          Enter your Intervals.icu API credentials to fetch your training data. 
          You can find these in your Intervals.icu account under Settings → Developer Settings.
        </p>

        <form onSubmit={handleSave} className="space-y-6">
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
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2 min-w-[150px]"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Save className="h-5 w-5" />
              )}
              Save Settings
            </button>

            {hasCredentialsSaved && (
              <button
                type="button"
                onClick={testConnection}
                disabled={testing}
                className="btn-secondary flex items-center justify-center gap-2 min-w-[150px]"
              >
                {testing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : connectionStatus === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : connectionStatus === 'error' ? (
                  <XCircle className="h-5 w-5 text-red-600" />
                ) : null}
                Test Connection
              </button>
            )}
          </div>

          {connectionStatus && (
            <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
              connectionStatus === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {connectionStatus === 'success' ? (
                <>
                  <CheckCircle className="h-5 w-5" />
                  Connection successful! Your credentials are valid.
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5" />
                  Connection failed. Please check your credentials.
                </>
              )}
            </div>
          )}
        </form>
        </div>

        {/* OpenAI Configuration */}
        <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-900">OpenAI Configuration</h2>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              Configure your own OpenAI API key to use AI features. Your API key is stored securely and used only for your requests.
              You can get an API key from <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">platform.openai.com</a>.
            </p>

            <div className="space-y-6">
              {openaiMessage.text && (
                <div className={`p-3 rounded-xl text-sm ${
                  openaiMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {openaiMessage.text}
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => toggleOpenAI(!openaiConfig.enabled)}
                  className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                    openaiConfig.enabled ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                  }`}
                >
                  {openaiConfig.enabled && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="font-medium text-gray-900">Enable OpenAI Integration</span>
              </label>

              {openaiConfig.enabled && (
                <>
                  <div>
                    <label htmlFor="openaiKey" className="block text-sm font-medium text-gray-700 mb-1">
                      OpenAI API Key
                    </label>
                    <input
                      id="openaiKey"
                      type="password"
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      className="input-field max-w-md"
                      placeholder="sk-..."
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={testOpenAIConnection}
                      disabled={openaiTesting || !openaiApiKey}
                      className="btn-primary flex items-center justify-center gap-2 min-w-[150px]"
                    >
                      {openaiTesting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                      Test Connection
                    </button>

                    {openaiConfig.connectionTested && (
                      <button
                        onClick={loadModels}
                        disabled={loadingModels}
                        className="btn-secondary flex items-center justify-center gap-2 min-w-[150px]"
                      >
                        {loadingModels ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                        Get AI Models
                      </button>
                    )}
                  </div>

                  {openaiConfig.connectionTested && (
                    <>

                      {models.length > 0 && (
                        <div>
                          <label htmlFor="modelSelect" className="block text-sm font-medium text-gray-700 mb-1">
                            Select Model
                          </label>
                          <div className="relative">
                            <select
                              id="modelSelect"
                              value={openaiConfig.selectedModel || ''}
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

                      {openaiConfig.selectedModel && (
                        <div className="bg-green-50 text-green-700 p-3 sm:p-4 rounded-lg">
                          <p className="font-medium">OpenAI is configured!</p>
                          <p className="text-sm mt-1">Using model: {openaiConfig.selectedModel}</p>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Strava Configuration */}
          <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <ExternalLink className="h-5 w-5 text-orange-600" />
              <h2 className="text-lg font-semibold text-gray-900">Strava Configuration</h2>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              Connect your Strava account to view activities and segments. 
              Create an API application at <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">strava.com/settings/api</a>.
              <strong className="block mt-1 text-orange-600">Note: Strava API requires a paid Strava subscription as of June 2026.</strong>
            </p>

            <div className="space-y-6">
              {stravaMessage.text && (
                <div className={`p-3 rounded-xl text-sm ${
                  stravaMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {stravaMessage.text}
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => toggleStrava(!stravaEnabled)}
                  className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                    stravaEnabled ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                  }`}
                >
                  {stravaEnabled && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="font-medium text-gray-900">Enable Strava Integration</span>
              </label>

              {stravaEnabled && (
                <>
                  <div>
                    <label htmlFor="stravaClientId" className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      Strava Client ID
                      {hasStravaConfig && stravaClientId && !stravaClientId.includes('•') && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Saved</span>
                      )}
                      {hasStravaConfig && stravaClientId.includes('•') && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">✓ Configured</span>
                      )}
                    </label>
                    <input
                      id="stravaClientId"
                      type="text"
                      value={stravaClientId}
                      onChange={(e) => setStravaClientId(e.target.value)}
                      className="input-field max-w-md"
                      placeholder="Enter your Strava Client ID"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      From your Strava API application settings
                    </p>
                  </div>

                  <div>
                    <label htmlFor="stravaClientSecret" className="block text-sm font-medium text-gray-700 mb-1">
                      Strava Client Secret
                    </label>
                    <input
                      id="stravaClientSecret"
                      type="password"
                      value={stravaClientSecret}
                      onChange={(e) => setStravaClientSecret(e.target.value)}
                      className="input-field max-w-md"
                      placeholder={hasStravaConfig ? "•••••••••••••••• (enter new to change)" : "Enter your Strava Client Secret"}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Keep this secret! Do not share or commit to code.
                      {hasStravaConfig && " Type a new value only if you want to change it."}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={handleSaveStrava}
                      disabled={savingStrava || (!stravaClientId && !stravaClientSecret)}
                      className="btn-primary flex items-center justify-center gap-2 min-w-[150px]"
                    >
                      {savingStrava ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <Save className="h-5 w-5" />
                          Save Strava Settings
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleConnectStrava}
                      disabled={exchangingStrava || !hasStravaConfig}
                      className="btn-secondary flex items-center justify-center gap-2 min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {exchangingStrava ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : hasStravaToken ? (
                        <>
                          <CheckCircle className="h-5 w-5" />
                          Reconnect Strava
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-5 w-5" />
                          Connect Strava
                        </>
                      )}
                    </button>

                    {hasStravaToken && (
                      <button
                        type="button"
                        onClick={testStravaConnection}
                        disabled={testingStrava}
                        className="btn-secondary flex items-center justify-center gap-2 min-w-[150px]"
                      >
                        {testingStrava ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle className="h-5 w-5" />
                            Test Connection
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
  );
};

export default Profile;
