import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CustomerPage from './pages/CustomerPage';
import AdminPage from './pages/AdminPage';
import TrackingPage from './pages/TrackingPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CustomerPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/dashboard" element={<AdminPage />} />
        <Route path="/track/:orderId" element={<TrackingPage />} />
      </Routes>
    </BrowserRouter>
  );
}
