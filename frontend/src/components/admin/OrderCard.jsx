import { useState } from 'react';
import { api } from '../../lib/api';
import useAuthStore from '../../stores/authStore';

const STATUS_COLORS = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  ACCEPTED: 'bg-blue-100 text-blue-700',
  PREPARING: 'bg-orange-100 text-orange-700',
  READY: 'bg-purple-100 text-purple-700',
  DISPATCHED: 'bg-indigo-100 text-indigo-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default function OrderCard({ order, onRefresh }) {
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(false);
  const [deliveryBoyPhone, setDeliveryBoyPhone] = useState('');

  async function updateStatus(status) {
    setLoading(true);
    try {
      await api.updateOrderStatus(order.id, status, token);
      onRefresh?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function assignOwnBoy() {
    setLoading(true);
    try {
      await api.assignOwnBoy(order.id, deliveryBoyPhone, token);
      onRefresh?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  const createdAt = order.timestamps?.createdAt?.toDate?.() || new Date(order.timestamps?.createdAt);
  const timeStr = createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <div className="font-semibold text-sm text-gray-900">#{order.id.slice(-6)}</div>
          <div className="text-xs text-gray-400">{timeStr}</div>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[order.status]}`}>
          {order.status}
        </span>
      </div>

      {/* Customer */}
      <div className="px-4 py-2 bg-gray-50 text-xs text-gray-600">
        <span className="font-medium">{order.customer?.name}</span>
        {' · '}
        <span>{order.customer?.phone}</span>
        {' · '}
        <span>{order.customer?.address}</span>
      </div>

      {/* Items */}
      <div className="px-4 py-3 space-y-1">
        {order.items?.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-700">
              {item.name}
              {item.cut ? ` · ${item.cut}` : ''} —{' '}
              {item.weight >= 1000 ? `${item.weight / 1000} kg` : `${item.weight}g`}
            </span>
            <span className="text-gray-500 font-medium">₹{item.totalPrice}</span>
          </div>
        ))}
      </div>

      {/* Pricing */}
      <div className="px-4 pb-3 flex justify-between text-sm border-t pt-2">
        <span className="text-gray-500">
          Delivery ₹{order.pricing?.deliveryCharge} · COD token ₹{order.pricing?.codTokenAmount}
        </span>
        <span className="font-semibold text-gray-900">₹{order.pricing?.total}</span>
      </div>

      {/* Payment badge */}
      <div className="px-4 pb-3">
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            order.payment?.status === 'token_paid' || order.payment?.status === 'paid'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          Payment: {order.payment?.status}
        </span>
      </div>

      {/* Actions */}
      {order.status === 'PENDING' && (
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={() => updateStatus('ACCEPTED')}
            disabled={loading}
            className="flex-1 min-h-[44px] bg-green-500 text-white rounded-xl text-sm font-semibold
                       active:bg-green-600 disabled:opacity-40"
          >
            ✅ Accept
          </button>
          <button
            onClick={() => updateStatus('CANCELLED')}
            disabled={loading}
            className="flex-1 min-h-[44px] bg-red-100 text-red-600 rounded-xl text-sm font-semibold
                       active:bg-red-200 disabled:opacity-40"
          >
            ✕ Reject
          </button>
        </div>
      )}

      {order.status === 'ACCEPTED' && (
        <div className="px-4 pb-4">
          <button
            onClick={() => updateStatus('PREPARING')}
            disabled={loading}
            className="w-full min-h-[44px] bg-orange-500 text-white rounded-xl text-sm font-semibold
                       active:bg-orange-600 disabled:opacity-40"
          >
            🔪 Start Preparing
          </button>
        </div>
      )}

      {order.status === 'PREPARING' && (
        <div className="px-4 pb-4">
          <button
            onClick={() => updateStatus('READY')}
            disabled={loading}
            className="w-full min-h-[44px] bg-purple-500 text-white rounded-xl text-sm font-semibold
                       active:bg-purple-600 disabled:opacity-40"
          >
            📦 Mark Ready
          </button>
        </div>
      )}

      {order.status === 'READY' && (
        <div className="px-4 pb-4 space-y-2">
          <div className="text-xs text-gray-500 font-medium">Assign delivery:</div>
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="Delivery boy phone (optional)"
              value={deliveryBoyPhone}
              onChange={(e) => setDeliveryBoyPhone(e.target.value)}
              className="flex-1 min-h-[44px] px-3 rounded-xl bg-gray-100 text-sm outline-none"
            />
            <button
              onClick={assignOwnBoy}
              disabled={loading}
              className="min-h-[44px] px-4 bg-[#C0451A] text-white rounded-xl text-sm font-semibold
                         active:bg-[#8B2E0F] disabled:opacity-40"
            >
              🚴 Dispatch
            </button>
          </div>
        </div>
      )}

      {order.status === 'DISPATCHED' && (
        <div className="px-4 pb-4">
          <button
            onClick={() => updateStatus('DELIVERED')}
            disabled={loading}
            className="w-full min-h-[44px] bg-green-600 text-white rounded-xl text-sm font-semibold
                       active:bg-green-700 disabled:opacity-40"
          >
            🎉 Mark Delivered
          </button>
        </div>
      )}
    </div>
  );
}
