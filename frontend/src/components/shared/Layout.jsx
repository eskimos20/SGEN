import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  BarChart3, 
  User, 
  Settings, 
  LogOut, 
  Home, 
  Shield, 
  Bike, 
  Calendar, 
  Dumbbell,
  Search,
  Scan,
  Trophy,
  Clock, 
  Menu, 
  X, 
  Key, 
  Utensils,
  Activity 
} from 'lucide-react';
import VersionNotifier from '../notifications/VersionNotifier';

import api from '../../api/axios';

const Layout = () => {
  const { user, logout, hasIntervalsConfig } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [uptime, setUptime] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [serverStartTime, setServerStartTime] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showVersionNotifier, setShowVersionNotifier] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Hide navigation on change-password page
  const isChangePasswordPage = location.pathname === '/change-password';

  // Check if mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Prevent pull-to-refresh when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      // Prevent background scrolling but allow menu scrolling
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [mobileMenuOpen]);

  // Update uptime every second based on server start time
  useEffect(() => {
    if (!serverStartTime) return;

    const formatUptime = () => {
      const elapsed = Date.now() - serverStartTime;
      const seconds = Math.floor(elapsed / 1000) % 60;
      const minutes = Math.floor(elapsed / (1000 * 60)) % 60;
      const hours = Math.floor(elapsed / (1000 * 60 * 60)) % 24;
      const days = Math.floor(elapsed / (1000 * 60 * 60 * 24)) % 30;
      const months = Math.floor(elapsed / (1000 * 60 * 60 * 24 * 30)) % 12;
      const years = Math.floor(elapsed / (1000 * 60 * 60 * 24 * 365));

      const parts = [];
      if (years > 0) parts.push(`${years}y`);
      if (months > 0) parts.push(`${months}mo`);
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}min`);
      parts.push(`${seconds}sec`);

      return parts.join(' ');
    };

    setUptime(formatUptime());
    const interval = setInterval(() => setUptime(formatUptime()), 1000);
    return () => clearInterval(interval);
  }, [serverStartTime]);

  // Fetch app version and server start time on mount
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await api.get('/version');
        setAppVersion(response.data.version);
        setServerStartTime(response.data.serverStartTime);
      } catch (err) {
        // Silently fail - version is optional
      }
    };
    fetchVersion();
  }, []);

  const handleLogout = () => {
    logout();
  };

  const handleChangePassword = () => {
    navigate('/change-password');
    setMobileMenuOpen(false);
  };

  const isAdmin = user?.role === 'ADMIN';
  
  // Admin sees Admin panel and Monitoring, regular users see Dashboard, Statistics, Gear (if configured), Profile
  const navItems = isAdmin
    ? [
        { to: '/admin', icon: Shield, label: 'Admin' },
        { to: '/monitoring', icon: Activity, label: 'Monitoring' }
      ]
    : [
        { to: '/dashboard', icon: Home, label: 'Dashboard' },
        ...(hasIntervalsConfig ? [{ to: '/statistics', icon: BarChart3, label: 'Statistics' }] : []),
        ...(hasIntervalsConfig ? [{ to: '/nutrition', icon: Utensils, label: 'Nutrition' }] : []),
        ...(hasIntervalsConfig ? [{ to: '/calendar', icon: Calendar, label: 'Calendar' }] : []),
        ...(hasIntervalsConfig && !isMobile ? [{ to: '/workout-creator', icon: Dumbbell, label: 'Workout Creator' }] : []),
        ...(hasIntervalsConfig ? [{ to: '/search-workouts', icon: Search, label: 'Search Workouts' }] : []),
        ...(hasIntervalsConfig ? [{ to: '/bikefit', icon: Scan, label: 'BikeFit' }] : []),
        ...(hasIntervalsConfig ? [{ to: '/achievements', icon: Trophy, label: 'Achievements' }] : []),
        ...(hasIntervalsConfig ? [{ to: '/gear', icon: Bike, label: 'Gear' }] : []),
        { to: '/profile', icon: User, label: 'Profile' },
      ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left side - SGEN Statistics Generator */}
            <div className="flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-primary-600" />
              <span className="text-xl font-bold text-gray-900">SGEN</span>
              <span className="text-sm text-gray-500 hidden sm:block">Statistics Generator</span>
              {appVersion && (
              <button
                onClick={() => setShowVersionNotifier(true)}
                className="text-xs text-purple-600 hover:text-purple-700 font-medium cursor-pointer transition-colors"
                title="Click to see version details"
              >
                v.{appVersion}
              </button>
            )}
            </div>
            
            {/* Right side - Uptime, Change Password, Logout */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-500" title="App uptime">
                <Clock className="h-3.5 w-3.5" />
                <span>Uptime: {uptime}</span>
              </div>
              
              <span className="hidden sm:block text-xs text-gray-400">-</span>
              
              {/* Change Password button */}
              <button
                onClick={handleChangePassword}
                className="hidden sm:flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors p-2 rounded-lg hover:bg-gray-100"
                title="Change Password"
              >
                <Key className="h-4 w-4" />
                <span className="hidden sm:block text-sm">Change Passwd</span>
              </button>
              
              <span className="hidden sm:block text-xs text-gray-400">-</span>
              
              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="sm:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
              
              {/* Desktop logout */}
              <button
                onClick={handleLogout}
                className="hidden sm:flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors p-2 rounded-lg hover:bg-gray-100"
              >
                <LogOut className="h-5 w-5" />
                <span className="hidden sm:block">Logout</span>
              </button>
            </div>
            
            {/* Version Notifier - positioned in top right */}
            {showVersionNotifier && (
              <div className="fixed top-24 inset-x-4 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm z-50">
                <VersionNotifier 
                  isVisible={showVersionNotifier} 
                  onDismiss={() => setShowVersionNotifier(false)} 
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div 
            className="fixed inset-0 bg-black/25" 
            onClick={() => setMobileMenuOpen(false)}
            style={{ touchAction: 'none' }}
          />
          <nav 
            className="fixed top-0 left-0 bottom-0 w-64 bg-white shadow-xl flex flex-col" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-8 w-8 text-primary-600" />
                <span className="text-xl font-bold text-gray-900">SGEN</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div 
              className="flex-1 overflow-y-auto p-4 space-y-2"
              style={{ 
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span>{label}</span>
                </NavLink>
              ))}
              
              <div className="border-t border-gray-200 pt-4 mt-4">
                <button
                  onClick={handleChangePassword}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <Key className="h-5 w-5" />
                  <span>Change Password</span>
                </button>
                
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </nav>
        </div>
      )}

      <div className="flex">
        {/* Desktop Sidebar - visible on all pages including change-password */}
        <nav className="hidden sm:block w-64 bg-white shadow-sm min-h-[calc(100vh-4rem)] border-r border-gray-200">
          <div className="p-4 space-y-2">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="hidden sm:block">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-x-hidden min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
