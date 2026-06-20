import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BarChart3, Eye, EyeOff } from 'lucide-react';
import { getApiBaseUrl, isCapacitor } from '../config/api.config.js';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userData = await login(username, password);
      if (userData.mustChangePassword) {
        navigate('/change-password');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      // Build detailed error message for display in UI
      let errorMsg = 'Login failed';
      
      if (err.message) {
        errorMsg = `Error: ${err.message}`;
      }
      
      if (err.response) {
        errorMsg = `Server error: ${err.response.status} - ${err.response.data?.error || err.response.statusText}`;
      } else if (err.request) {
        // Request was made but no response - network/cors issue
        errorMsg = `Network error: Cannot connect to ${apiUrl}. Check your internet connection and that the server is running`;
      }
      
      console.error('Login error:', err);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Debug info
  const apiUrl = getApiBaseUrl();
  console.log('Login page - API URL:', apiUrl, 'isCapacitor:', isCapacitor);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="card max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <BarChart3 className="h-10 w-10 text-primary-600" />
            <h1 className="text-3xl font-bold text-gray-900">SGEN</h1>
          </div>
          <p className="text-gray-600">Statistics Generator</p>
          {isCapacitor && (
            <div className="mt-2 text-xs text-gray-400">
              API: {apiUrl}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className={`p-3 rounded-lg text-sm whitespace-pre-wrap ${error.includes('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {error}
            </div>
          )}


          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              placeholder="Enter your username"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pr-10"
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
