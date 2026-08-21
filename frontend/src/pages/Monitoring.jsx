import { useState, useEffect } from 'react';
import api from '../api/axios';
import { 
  Cpu, 
  HardDrive, 
  MemoryStick, 
  Activity,
  Loader2,
  AlertCircle
} from 'lucide-react';

const Monitoring = () => {
  const [systemInfo, setSystemInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchSystemInfo = async () => {
    try {
      const response = await api.get('/admin/system/info');
      setSystemInfo(response.data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError('Failed to fetch system information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let interval = null;

    const startPolling = () => {
      // Initial fetch
      fetchSystemInfo();
      // Update every 3 seconds
      interval = setInterval(fetchSystemInfo, 3000);
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    // Handle visibility change - pause polling when tab is hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    // Start polling if tab is visible
    if (!document.hidden) {
      startPolling();
    }

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatPercent = (value) => {
    return Math.round(value * 10) / 10;
  };

  const getProgressColor = (percent) => {
    if (percent < 50) return 'bg-green-500';
    if (percent < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-red-600" />
        <span className="text-red-700">{error}</span>
      </div>
    );
  }

  if (!systemInfo) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-gray-600">
        No system information available
      </div>
    );
  }

  const { cpu, memory, disk } = systemInfo;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">System Monitoring</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">
            Last updated: {lastUpdate?.toLocaleTimeString() || 'Never'}
          </p>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-green-500 animate-pulse" />
            <span className="text-sm text-green-600 font-medium">Live</span>
          </div>
        </div>
      </div>

      {/* CPU Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Cpu className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">CPU</h3>
            <p className="text-sm text-gray-500">{cpu?.coresCount || 'Unknown'} cores • Load: {formatPercent(cpu?.loadAverage || 0)}</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Overall CPU Usage */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Overall Usage</span>
              <span className="font-medium text-gray-900">{formatPercent(cpu?.usagePercent || 0)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${getProgressColor(cpu?.usagePercent || 0)}`}
                style={{ width: `${cpu?.usagePercent || 0}%` }}
              />
            </div>
          </div>

          {/* Cores */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
            {cpu?.cores?.map((core, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Core {index}</p>
                <p className="text-lg font-semibold text-gray-900">{formatPercent(core)}%</p>
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden mt-2">
                  <div 
                    className={`h-full transition-all duration-500 ${getProgressColor(core)}`}
                    style={{ width: `${core}%` }}
                  />
                </div>
              </div>
            )) || (
              <div className="col-span-4 text-sm text-gray-500">
                Core information not available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Memory Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <MemoryStick className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Memory</h3>
            <p className="text-sm text-gray-500">
              {formatBytes(memory?.used || 0)} / {formatBytes(memory?.total || 0)} used
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* System Memory */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">System RAM</h4>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Used</span>
              <span className="font-medium text-gray-900">{formatPercent(memory?.usagePercent || 0)}%</span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${getProgressColor(memory?.usagePercent || 0)}`}
                style={{ width: `${memory?.usagePercent || 0}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Total</p>
                <p className="text-lg font-semibold text-gray-900">{formatBytes(memory?.total || 0)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Used</p>
                <p className="text-lg font-semibold text-gray-900">{formatBytes(memory?.used || 0)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Free</p>
                <p className="text-lg font-semibold text-green-600">{formatBytes(memory?.free || 0)}</p>
              </div>
            </div>
          </div>

          {/* Application (JVM) Memory */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Application RAM (JVM)</h4>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Used</span>
              <span className="font-medium text-gray-900">
                {formatPercent(((memory?.jvmUsed || (memory?.jvmTotal - memory?.jvmFree)) / memory?.jvmMax) * 100 || 0)}%
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${getProgressColor(((memory?.jvmUsed || (memory?.jvmTotal - memory?.jvmFree)) / memory?.jvmMax) * 100 || 0)}`}
                style={{ width: `${((memory?.jvmUsed || (memory?.jvmTotal - memory?.jvmFree)) / memory?.jvmMax) * 100 || 0}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Allocated</p>
                <p className="text-lg font-semibold text-gray-900">{formatBytes(memory?.jvmTotal || 0)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Used by App</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatBytes((memory?.jvmTotal || 0) - (memory?.jvmFree || 0))}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Max Allowed</p>
                <p className="text-lg font-semibold text-blue-600">{formatBytes(memory?.jvmMax || 0)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Disk Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-amber-100 rounded-lg">
            <HardDrive className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Storage</h3>
            <p className="text-sm text-gray-500">{disk?.path || 'Root'}</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Disk Usage Bar */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Used Space</span>
              <span className="font-medium text-gray-900">{formatPercent(disk?.usagePercent || 0)}%</span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${getProgressColor(disk?.usagePercent || 0)}`}
                style={{ width: `${disk?.usagePercent || 0}%` }}
              />
            </div>
          </div>

          {/* Disk Details */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Total</p>
              <p className="text-xl font-semibold text-gray-900">{formatBytes(disk?.total || 0)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Used</p>
              <p className="text-xl font-semibold text-gray-900">{formatBytes(disk?.used || 0)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Free</p>
              <p className="text-xl font-semibold text-green-600">{formatBytes(disk?.free || 0)}</p>
            </div>
          </div>

          {/* Application Specific Info */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Application Storage</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Main Workout Library</p>
                <p className="text-sm font-semibold text-gray-900">{disk?.mainLibraryPath || 'N/A'}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {formatBytes(disk?.mainLibrarySize || 0)} used
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Custom User Workouts</p>
                <p className="text-sm font-semibold text-gray-900">{disk?.customWorkoutsPath || 'N/A'}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {formatBytes(disk?.customWorkoutsSize || 0)} used
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Database</p>
                <p className="text-sm font-semibold text-gray-900">{disk?.databasePath || 'N/A'}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {formatBytes(disk?.databaseSize || 0)} used
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Monitoring;
