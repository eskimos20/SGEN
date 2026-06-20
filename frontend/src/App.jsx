import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CalendarProvider } from './context/CalendarContext';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import Profile from './pages/Profile';
import Statistics from './pages/Statistics';
import Gear from './pages/Gear';
import Calendar from './pages/Calendar';
import WorkoutCreator from './pages/WorkoutCreator';
import SearchWorkouts from './pages/SearchWorkouts';
import BikeFit from './pages/BikeFit';
import Achievements from './pages/Achievements';
import Nutrition from './pages/Nutrition';
import Monitoring from './pages/Monitoring';
import Layout from './components/shared/Layout';

const ProtectedRoute = ({ children, adminOnly = false, userOnly = false, allowChangePassword = false }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Allow access to change-password page even if mustChangePassword is true
  if (user.mustChangePassword && !allowChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (adminOnly && user.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  // Redirect admin away from user-only pages
  if (userOnly && user.role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }

  return children;
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'ADMIN' ? '/admin' : '/dashboard'} replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="change-password" element={<ChangePassword />} />
        <Route index element={<Navigate to={user?.role === 'ADMIN' ? '/admin' : '/dashboard'} replace />} />
        <Route path="dashboard" element={
          <ProtectedRoute userOnly>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="profile" element={
          <ProtectedRoute userOnly>
            <Profile />
          </ProtectedRoute>
        } />
        <Route path="statistics" element={
          <ProtectedRoute userOnly>
            <Statistics />
          </ProtectedRoute>
        } />
        <Route path="gear" element={
          <ProtectedRoute userOnly>
            <Gear />
          </ProtectedRoute>
        } />
        <Route path="calendar" element={
          <ProtectedRoute userOnly>
            <Calendar />
          </ProtectedRoute>
        } />
        <Route path="workout-creator" element={
          <ProtectedRoute userOnly>
            <WorkoutCreator />
          </ProtectedRoute>
        } />
        <Route path="search-workouts" element={
          <ProtectedRoute userOnly>
            <SearchWorkouts />
          </ProtectedRoute>
        } />
        <Route path="bikefit" element={
          <ProtectedRoute userOnly>
            <BikeFit />
          </ProtectedRoute>
        } />
        <Route path="achievements" element={
          <ProtectedRoute userOnly>
            <Achievements />
          </ProtectedRoute>
        } />
        <Route path="nutrition" element={
          <ProtectedRoute userOnly>
            <Nutrition />
          </ProtectedRoute>
        } />
        <Route
          path="admin"
          element={
            <ProtectedRoute adminOnly>
              <AdminPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="monitoring"
          element={
            <ProtectedRoute adminOnly>
              <Monitoring />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={user?.role === 'ADMIN' ? '/admin' : '/dashboard'} replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CalendarProvider>
          <AppRoutes />
        </CalendarProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
