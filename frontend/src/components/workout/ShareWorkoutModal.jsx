import { useState, useEffect, useMemo } from 'react';
import { X, Search, Share2, Loader2, Calendar } from 'lucide-react';
import api from '../../api/axios';

const ShareWorkoutModal = ({ isOpen, onClose, workout, onShared }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [addToOwnerCalendar, setAddToOwnerCalendar] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!isOpen) return;

    const fetchUsers = async () => {
      setFetching(true);
      try {
        const response = await api.get('/workout-shares/sharable-users');
        setUsers(response.data.users || []);
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to load users' });
      } finally {
        setFetching(false);
      }
    };

    fetchUsers();
    setSelected(new Set());
    setMessage({ type: '', text: '' });
    setScheduledDate(new Date().toISOString().split('T')[0]);
    setAddToOwnerCalendar(false);
  }, [isOpen]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.toLowerCase();
    return users.filter(u => u.username.toLowerCase().includes(term));
  }, [users, search]);

  const toggleUser = (username) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  };

  const handleShare = async () => {
    if (selected.size === 0) {
      setMessage({ type: 'error', text: 'Select at least one user' });
      return;
    }
    if (!workout?.zwoFilePath) {
      setMessage({ type: 'error', text: 'Workout path is missing' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const payload = {
        toUsernames: Array.from(selected),
        sourcePath: workout.zwoFilePath,
        workoutName: workout.name,
        category: workout.category,
        tss: workout.tss,
        scheduledDate,
        addToOwnerCalendar
      };
      await api.post('/workout-shares', payload);
      setMessage({ type: 'success', text: 'Workout shared successfully!' });
      if (onShared) onShared();
      setTimeout(() => onClose(), 1000);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to share workout' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">Share Workout</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div>
            <p className="text-sm text-gray-600 mb-1">Workout</p>
            <p className="font-medium text-gray-900">{workout?.name}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Schedule date
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="input-field w-full"
            />
          </div>

          <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <div
              className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                addToOwnerCalendar ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
              }`}
            >
              {addToOwnerCalendar && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className="text-sm text-gray-900">Add to your calendar also</span>
            <input
              type="checkbox"
              className="sr-only"
              checked={addToOwnerCalendar}
              onChange={(e) => setAddToOwnerCalendar(e.target.checked)}
            />
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Share with</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field w-full pl-9"
              />
            </div>
          </div>

          {fetching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              {users.length === 0 ? 'No users have enabled workout sharing.' : 'No users match your search.'}
            </p>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
              {filteredUsers.map(user => (
                <label
                  key={user.id}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                >
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                      selected.has(user.username) ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                    }`}
                  >
                    {selected.has(user.username) && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-900">{user.username}</span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selected.has(user.username)}
                    onChange={() => toggleUser(user.username)}
                  />
                </label>
              ))}
            </div>
          )}

          {message.text && (
            <div className={`p-3 rounded-xl text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {message.text}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={handleShare}
            disabled={loading || selected.size === 0}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Share
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareWorkoutModal;
