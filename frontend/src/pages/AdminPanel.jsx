import { useState } from 'react';
import { Users, Bug, Activity, Database } from 'lucide-react';
import UsersTab from '../components/admin/UsersTab';
import DebugTab from '../components/admin/DebugTab';
import DatabaseTab from '../components/admin/DatabaseTab';
import { useAuth } from '../context/AuthContext';

const AdminPanel = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(user?.bootstrapMode ? 'database' : 'users');
  const [lastUpdate, setLastUpdate] = useState(null);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        {lastUpdate && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-500 animate-pulse" />
              <span className="text-sm text-green-600 font-medium">Live</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {!user?.bootstrapMode && <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <Users className="h-5 w-5" />
          Users
        </button>}
        {!user?.bootstrapMode && <button
          onClick={() => setActiveTab('debug')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'debug'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <Bug className="h-5 w-5" />
          Debug
        </button>}
        <button
          onClick={() => setActiveTab('database')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'database'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <Database className="h-5 w-5" />
          Databas
        </button>
      </div>

      {!user?.bootstrapMode && activeTab === 'users' && <UsersTab onLastUpdate={setLastUpdate} />}
      {!user?.bootstrapMode && activeTab === 'debug' && <DebugTab />}
      {activeTab === 'database' && <DatabaseTab />}
    </div>
  );
};

export default AdminPanel;
