import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Plus, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import ConfirmDialog from '../modals/ConfirmDialog';

const UsersTab = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, userId: null, username: '' });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await api.get('/admin/users');
      setUsers(response.data);
    } catch (err) {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    setMessage({ type: '', text: '' });

    try {
      await api.post('/admin/users', { username: newUsername });
      setNewUsername('');
      setMessage({ type: 'success', text: `User "${newUsername}" created with default password "password"` });
      loadUsers();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create user' });
    } finally {
      setCreating(false);
    }
  };

  const deleteUser = async () => {
    const { userId, username } = deleteDialog;
    setDeleteDialog({ isOpen: false, userId: null, username: '' });

    try {
      await api.delete(`/admin/users/${userId}`);
      setMessage({ type: 'success', text: `User "${username}" deleted` });
      loadUsers();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to delete user' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-mobile">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New User</h2>
        
        {message.text && (
          <div className={`p-3 rounded-lg text-sm mb-4 ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={createUser} className="flex gap-3">
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="input-field flex-1"
            placeholder="Enter username"
            required
          />
          <button type="submit" disabled={creating} className="btn-primary flex items-center gap-2">
            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Create
          </button>
        </form>
      </div>

      <div className="card-mobile">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Users</h2>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No users created yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Username</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Intervals.icu</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">OpenAI</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Created</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Last Login</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{user.username}</td>
                    <td className="py-3 px-4">
                      {user.mustChangePassword ? (
                        <span className="text-amber-600 text-sm">Must change password</span>
                      ) : (
                        <span className="text-green-600 text-sm">Active</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {user.hasIntervalsConfig ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-gray-400" />
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {user.hasOpenAIConfig ? (
                        <CheckCircle className="h-5 w-5 text-green-600" title="OpenAI configured" />
                      ) : (
                        <XCircle className="h-5 w-5 text-gray-400" title="OpenAI not configured" />
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {user.lastLogin
                        ? new Date(user.lastLogin).toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
                        : '-'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setDeleteDialog({ isOpen: true, userId: user.id, username: user.username })}
                        className="text-red-600 hover:text-red-800 p-1"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Delete User"
        message={`Are you sure you want to delete user "${deleteDialog.username}"?\n\nThis will permanently delete all their data from our database including:\n• Weather forecasts and locations\n• FTP and VO2Max results\n• Achievements\n• Gear maintenance records\n• BikeFit settings and analyses\n• AI usage logs\n\nThis action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmStyle="danger"
        onConfirm={deleteUser}
        onCancel={() => setDeleteDialog({ isOpen: false, userId: null, username: '' })}
      />
    </div>
  );
};

export default UsersTab;
