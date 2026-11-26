import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Spinner } from './ui.jsx';
import Login from './pages/Login.jsx';
import AdminLayout from './admin/AdminLayout.jsx';
import Dashboard from './admin/Dashboard.jsx';
import Campaigns from './admin/Campaigns.jsx';
import CampaignDetail from './admin/CampaignDetail.jsx';
import Visits from './admin/Visits.jsx';
import People from './admin/People.jsx';
import Vehicles from './admin/Vehicles.jsx';
import VehicleLog from './admin/VehicleLog.jsx';
import Activity from './admin/Activity.jsx';
import DriverLayout from './driver/DriverLayout.jsx';
import DriverHome from './driver/DriverHome.jsx';
import StopScreen from './driver/StopScreen.jsx';
import DriverHistory from './driver/DriverHistory.jsx';

function Guard({ role, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (role === 'driver' && user.role !== 'driver') return <Navigate to="/admin" replace />;
  if (role === 'staff' && user.role === 'driver') return <Navigate to="/driver" replace />;
  return children;
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  const home = user ? (user.role === 'driver' ? '/driver' : '/admin') : '/login';
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<Guard role="staff"><AdminLayout /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="visits" element={<Visits />} />
        <Route path="drivers" element={<People kind="driver" />} />
        <Route path="subadmins" element={<People kind="subadmin" />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="vehicle-log" element={<VehicleLog />} />
        <Route path="activity" element={<Activity />} />
      </Route>
      <Route path="/driver" element={<Guard role="driver"><DriverLayout /></Guard>}>
        <Route index element={<DriverHome />} />
        <Route path="stop/:campaignId/:stopId" element={<StopScreen />} />
        <Route path="history" element={<DriverHistory />} />
      </Route>
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}
