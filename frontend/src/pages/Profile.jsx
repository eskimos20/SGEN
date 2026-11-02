import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { Save, CheckCircle, XCircle, Loader2, ChevronDown, Sparkles, ExternalLink, Share2, Bike } from 'lucide-react';

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


  // Zwift state
  const [zwiftEnabled, setZwiftEnabled] = useState(false);
  const [zwiftUsername, setZwiftUsername] = useState('');
  const [zwiftPassword, setZwiftPassword] = useState('');
  const [hasZwiftConfig, setHasZwiftConfig] = useState(false);
  const [zwiftMessage, setZwiftMessage] = useState({ type: '', text: '' });
  const [savingZwift, setSavingZwift] = useState(false);
  const [testingZwift, setTestingZwift] = useState(false);

  // Workout sharing state
  const [shareWorkoutsEnabled, setShareWorkoutsEnabled] = useState(false);
  const [shareWorkoutsMessage, setShareWorkoutsMessage] = useState({ type: '', text: '' });

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
      // Load Zwift config
      setZwiftEnabled(response.data.zwiftEnabled || false);
      setZwiftUsername(response.data.zwiftUsername || '');
      if (response.data.hasZwiftConfig) {
        setZwiftPassword('••••••••••••••••');
        setHasZwiftConfig(true);
      }
      setShareWorkoutsEnabled(response.data.shareWorkoutsEnabled || false);
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

  // Zwift handlers
  const toggleZwift = async (enabled) => {
    try {
      setZwiftMessage({ type: '', text: '' });
      await api.post(enabled ? '/user/zwift/enable' : '/user/zwift/disable');
      setZwiftEnabled(enabled);
      const userResponse = await api.get('/user/me');
      if (userResponse.data) {
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: userResponse.data }));
      }
    } catch (err) {
      setZwiftMessage({ type: 'error', text: 'Failed to update Zwift settings' });
    }
  };

  const handleSaveZwift = async () => {
    setSavingZwift(true);
    setZwiftMessage({ type: '', text: '' });

    try {
      await api.put('/user/profile', {
        zwiftUsername: zwiftUsername || undefined,
        zwiftPassword: zwiftPassword.includes('•') ? undefined : zwiftPassword,
      });
      setHasZwiftConfig(true);
      setZwiftMessage({ type: 'success', text: 'Zwift settings saved!' });
    } catch (err) {
      setZwiftMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save Zwift settings' });
    } finally {
      setSavingZwift(false);
    }
  };

  const testZwiftConnection = async () => {
    setTestingZwift(true);
    setZwiftMessage({ type: '', text: '' });

    try {
      const response = await api.post('/user/zwift/test', {
        username: zwiftUsername || undefined,
        password: zwiftPassword.includes('•') ? undefined : zwiftPassword,
      });
      if (response.data.success) {
        setHasZwiftConfig(true);
        setZwiftMessage({
          type: 'success',
          text: `Connected as ${response.data.name} — Zwift FTP: ${response.data.ftp} W`,
        });
      } else {
        setZwiftMessage({ type: 'error', text: response.data.message || 'Connection failed' });
      }
    } catch (err) {
      setZwiftMessage({ type: 'error', text: 'Connection failed. Check your credentials.' });
    } finally {
      setTestingZwift(false);
    }
  };

  // Workout sharing handlers
  const toggleShareWorkouts = async (enabled) => {
    try {
      setShareWorkoutsMessage({ type: '', text: '' });
      await api.put('/user/profile', { shareWorkoutsEnabled: enabled });
      setShareWorkoutsEnabled(enabled);
      const userResponse = await api.get('/user/me');
      if (userResponse.data) {
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: userResponse.data }));
      }
      setShareWorkoutsMessage({
        type: 'success',
        text: enabled ? 'Workout sharing enabled.' : 'Workout sharing disabled.'
      });
    } catch (err) {
      setShareWorkoutsMessage({ type: 'error', text: 'Failed to update sharing setting' });
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

          
          {/* Zwift Configuration */}
          <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bike className="h-5 w-5 text-orange-500" />
              <h2 className="text-lg font-semibold text-gray-900">Zwift</h2>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              Connect your Zwift account to automatically push your indoor FTP to your Zwift profile whenever it is updated here.
            </p>

            <div className="space-y-6">
              {zwiftMessage.text && (
                <div className={`p-3 rounded-xl text-sm ${
                  zwiftMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {zwiftMessage.text}
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => toggleZwift(!zwiftEnabled)}
                  className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                    zwiftEnabled ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                  }`}
                >
                  {zwiftEnabled && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="font-medium text-gray-900">Enable Zwift Integration</span>
              </label>

              {zwiftEnabled && (
                <>
                  <div>
                    <label htmlFor="zwiftUsername" className="block text-sm font-medium text-gray-700 mb-1">
                      Zwift Username (email)
                    </label>
                    <input
                      id="zwiftUsername"
                      type="text"
                      value={zwiftUsername}
                      onChange={(e) => setZwiftUsername(e.target.value)}
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
                      value={zwiftPassword}
                      onChange={(e) => setZwiftPassword(e.target.value)}
                      className="input-field max-w-md"
                      placeholder={hasZwiftConfig ? "•••••••••••••••• (enter new to change)" : "Enter your Zwift password"}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Stored securely and only used to sign in to Zwift.
                      {hasZwiftConfig && " Type a new value only if you want to change it."}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={handleSaveZwift}
                      disabled={savingZwift || !zwiftUsername}
                      className="btn-primary flex items-center justify-center gap-2 min-w-[150px]"
                    >
                      {savingZwift ? (
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
                      onClick={testZwiftConnection}
                      disabled={testingZwift || !zwiftUsername || !zwiftPassword}
                      className="btn-secondary flex items-center justify-center gap-2 min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {testingZwift ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="h-5 w-5" />
                          Test Connection
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Workout Sharing Configuration */}
          <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Share2 className="h-5 w-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-gray-900">Workout Sharing</h2>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              Enable this to allow other users to share workouts with you, and to share workouts from the workout library or your custom workouts to other users.
            </p>

            <div className="space-y-6">
              {shareWorkoutsMessage.text && (
                <div className={`p-3 rounded-xl text-sm ${
                  shareWorkoutsMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {shareWorkoutsMessage.text}
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => toggleShareWorkouts(!shareWorkoutsEnabled)}
                  className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                    shareWorkoutsEnabled ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                  }`}
                >
                  {shareWorkoutsEnabled && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="font-medium text-gray-900">Share/Receive Workouts</span>
              </label>
            </div>
          </div>
        </div>
      </div>
  );
};

export default Profile;
