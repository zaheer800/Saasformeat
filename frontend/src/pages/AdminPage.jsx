import { useEffect, useState } from 'react';
import useAuthStore from '../stores/authStore';
import { useOrders } from '../hooks/useOrders';
import { useStock } from '../hooks/useStock';
import StatsBar from '../components/admin/StatsBar';
import OrderCard from '../components/admin/OrderCard';
import StockPanel from '../components/admin/StockPanel';
import OfflineBanner from '../components/shared/OfflineBanner';
import { api } from '../lib/api';
import { shopConfig } from '../config/shop';

export default function AdminPage() {
  const { token, user, loading, error, sendOTP, verifyOTP, logout, initTokenRefresh } =
    useAuthStore();

  useEffect(() => {
    initTokenRefresh();
  }, []);

  if (!token) {
    return <AdminLogin loading={loading} error={error} sendOTP={sendOTP} verifyOTP={verifyOTP} />;
  }

  return <AdminDashboard token={token} onLogout={logout} />;
}

// --- Login Screen ---

function AdminLogin({ loading, error, sendOTP, verifyOTP }) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  async function handleSendOTP() {
    const formatted = phone.startsWith('+') ? phone : `+91${phone}`;
    const ok = await sendOTP(formatted);
    if (ok) setOtpSent(true);
  }

  async function handleVerifyOTP() {
    await verifyOTP(otp);
  }

  return (
    <div className="min-h-screen bg-[#FDF6EC] flex flex-col items-center justify-center px-6">
      {/* Recaptcha container (invisible) */}
      <div id="recaptcha-container" />

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🥩</div>
          <h1 className="text-xl font-bold text-gray-900">{shopConfig.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Admin Login</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          {!otpSent ? (
            <>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Admin Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter phone number"
                className="w-full min-h-[48px] px-4 rounded-xl bg-gray-100 text-sm outline-none mb-4"
              />
              {error && <div className="text-red-500 text-xs mb-3">{error}</div>}
              <button
                onClick={handleSendOTP}
                disabled={loading || !phone}
                className="w-full min-h-[48px] bg-[#C0451A] text-white rounded-xl text-sm font-semibold
                           active:bg-[#8B2E0F] disabled:opacity-40"
              >
                {loading ? 'Sending...' : 'Send OTP'}
              </button>
            </>
          ) : (
            <>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Enter OTP sent to {phone}
              </label>
              <input
                type="number"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit OTP"
                maxLength={6}
                className="w-full min-h-[48px] px-4 rounded-xl bg-gray-100 text-sm outline-none mb-4
                           text-center text-lg tracking-widest"
              />
              {error && <div className="text-red-500 text-xs mb-3">{error}</div>}
              <button
                onClick={handleVerifyOTP}
                disabled={loading || otp.length < 4}
                className="w-full min-h-[48px] bg-[#C0451A] text-white rounded-xl text-sm font-semibold
                           active:bg-[#8B2E0F] disabled:opacity-40"
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
              <button
                onClick={() => setOtpSent(false)}
                className="w-full mt-2 text-sm text-gray-400 py-2"
              >
                Change number
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Dashboard ---

function AdminDashboard({ token, onLogout }) {
  const { orders, loading: ordersLoading } = useOrders();
  const menu = useStock();
  const [tab, setTab] = useState('orders');
  const [shopIsOpen, setShopIsOpen] = useState(true);

  useEffect(() => {
    api.getShopConfig().then((c) => setShopIsOpen(c.isOpen));
  }, []);

  async function handleToggleShop() {
    try {
      const result = await api.toggleShop(token);
      setShopIsOpen(result.isOpen);
    } catch (err) {
      alert(err.message);
    }
  }

  const activeOrders = orders.filter(
    (o) => !['DELIVERED', 'CANCELLED'].includes(o.status)
  );
  const completedOrders = orders.filter(
    (o) => o.status === 'DELIVERED' || o.status === 'CANCELLED'
  );

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      <OfflineBanner />
      {/* Top bar */}
      <div className="bg-[#C0451A] text-white px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">{shopConfig.name}</div>
          <div className="text-xs text-white/70">Admin Dashboard</div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleShop}
            className={`text-xs px-3 py-1.5 rounded-full font-medium ${
              shopIsOpen ? 'bg-green-500 text-white' : 'bg-white/20 text-white'
            }`}
          >
            {shopIsOpen ? '● Open' : '○ Closed'}
          </button>
          <button onClick={onLogout} className="text-white/70 text-xs">
            Logout
          </button>
        </div>
      </div>

      {/* Stats */}
      <StatsBar orders={orders} menu={menu} />

      {/* Tabs */}
      <div className="flex border-b bg-white px-4">
        <TabButton active={tab === 'orders'} onClick={() => setTab('orders')}>
          Orders {activeOrders.length > 0 && `(${activeOrders.length})`}
        </TabButton>
        <TabButton active={tab === 'stock'} onClick={() => setTab('stock')}>
          Stock
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          History
        </TabButton>
      </div>

      {/* Tab content */}
      <div className="px-4 py-4">
        {tab === 'orders' && (
          <>
            {ordersLoading && (
              <div className="text-center text-sm text-gray-400 py-8">Loading orders...</div>
            )}
            {!ordersLoading && activeOrders.length === 0 && (
              <div className="text-center text-sm text-gray-400 py-8">
                No active orders right now.
              </div>
            )}
            {activeOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </>
        )}

        {tab === 'stock' && <StockPanel menu={menu} />}

        {tab === 'history' && (
          <>
            {completedOrders.length === 0 && (
              <div className="text-center text-sm text-gray-400 py-8">
                No completed orders today.
              </div>
            )}
            {completedOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-[#C0451A] text-[#C0451A]'
          : 'border-transparent text-gray-400'
      }`}
    >
      {children}
    </button>
  );
}
