import { useState } from 'react';
import { Users, Bug } from 'lucide-react';
import UsersTab from '../components/admin/UsersTab';
import DebugTab from '../components/admin/DebugTab';

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>

      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <Users className="h-5 w-5" />
          Users
        </button>
        <button
          onClick={() => setActiveTab('debug')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'debug'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <Bug className="h-5 w-5" />
          Debug
        </button>
      </div>

      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'debug' && <DebugTab />}
    </div>
  );
};

export default AdminPanel;
