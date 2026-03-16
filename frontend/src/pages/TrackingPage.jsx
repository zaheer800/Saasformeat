import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { shopConfig } from '../config/shop';
import { api } from '../lib/api';

const FREE_CANCEL_MINUTES = 2;

const STATUS_STEPS = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'DELIVERED'];

const STATUS_LABELS = {
  PENDING: 'Order Received',
  ACCEPTED: 'Order Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready for Pickup',
  DISPATCHED: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const STATUS_ICONS = {
  PENDING: '⏳',
  ACCEPTED: '✅',
  PREPARING: '🔪',
  READY: '📦',
  DISPATCHED: '🛵',
  DELIVERED: '🎉',
  CANCELLED: '✕',
};

export default function TrackingPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!orderId) return;
    const ref = doc(db, 'orders', orderId);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) setOrder({ id: snap.id, ...snap.data() });
      setLoading(false);
    });
    return unsubscribe;
  }, [orderId]);

  // Tick every 15s to re-evaluate whether free cancel window is still open
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  async function handleCancel() {
    if (!window.confirm('Cancel this order?')) return;
    setCancelling(true);
    try {
      await api.cancelOrder(orderId, 'customer_cancelled', 'customer');
    } catch (err) {
      alert(err.message);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FDF6EC]">
        <div className="text-gray-400 text-sm">Loading order...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FDF6EC]">
        <div className="text-gray-500 text-sm">Order not found.</div>
      </div>
    );
  }

  const isCancelled = order.status === 'CANCELLED';
  const isCompleted = order.status === 'DELIVERED';
  const currentIndex = STATUS_STEPS.indexOf(order.status);

  // Whether customer can cancel: PENDING always free; ACCEPTED within 2 min free
  const canCancel = order.status === 'PENDING' || order.status === 'ACCEPTED';

  let cancelLabel = 'Cancel order (free)';
  let cancelFeeWarning = null;

  if (order.status === 'ACCEPTED') {
    const acceptedAt = order.timestamps?.acceptedAt?.toDate?.()
      || (order.timestamps?.acceptedAt ? new Date(order.timestamps.acceptedAt) : null);

    if (acceptedAt) {
      const minutesSince = (now - acceptedAt.getTime()) / 1000 / 60;
      if (minutesSince >= FREE_CANCEL_MINUTES) {
        cancelLabel = 'Cancel order (₹50 fee)';
        cancelFeeWarning = 'Prep has started. A ₹50 cancellation fee applies.';
      } else {
        const remaining = Math.max(0, Math.ceil(FREE_CANCEL_MINUTES - minutesSince));
        cancelLabel = `Cancel order (free for ~${remaining} more min)`;
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#FDF6EC] max-w-md mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="text-xs text-gray-400 uppercase tracking-wide">{shopConfig.name}</div>
        <h1 className="text-xl font-bold text-gray-900 mt-0.5">Order #{orderId.slice(-6)}</h1>
      </div>

      {/* Status card */}
      <div
        className={`rounded-2xl p-5 mb-6 text-center ${
          isCancelled ? 'bg-red-50' : 'bg-white shadow-sm'
        }`}
      >
        <div className="text-4xl mb-2">{STATUS_ICONS[order.status]}</div>
        <div className="font-semibold text-gray-900">{STATUS_LABELS[order.status]}</div>
        {isCancelled && order.cancellation && (
          <div className="text-sm text-red-500 mt-1">
            {order.cancellation.reason?.replace(/_/g, ' ')}
            {order.cancellation.feeCharged > 0 && ` · ₹${order.cancellation.feeCharged} fee charged`}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {!isCancelled && (
        <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm">
          <div className="flex justify-between mb-3">
            {STATUS_STEPS.map((s, i) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i <= currentIndex
                      ? 'bg-[#C0451A] text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {i < currentIndex ? '✓' : i + 1}
                </div>
                <div className="text-[9px] text-gray-400 text-center w-10 leading-tight">
                  {STATUS_LABELS[s].split(' ')[0]}
                </div>
              </div>
            ))}
          </div>
          <div className="relative h-1 bg-gray-100 rounded-full mt-1">
            <div
              className="absolute left-0 top-0 h-1 bg-[#C0451A] rounded-full transition-all"
              style={{ width: `${(currentIndex / (STATUS_STEPS.length - 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Order summary */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <h2 className="font-semibold text-gray-900 mb-3">Order Summary</h2>
        <div className="space-y-2">
          {order.items?.map((item, i) => (
            <div key={i} className="flex justify-between text-sm text-gray-700">
              <span>
                {item.name}
                {item.cut ? ` (${item.cut})` : ''} —{' '}
                {item.weight >= 1000 ? `${item.weight / 1000} kg` : `${item.weight}g`}
              </span>
              <span className="font-medium">₹{item.totalPrice}</span>
            </div>
          ))}
        </div>

        <div className="border-t mt-3 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Items subtotal</span>
            <span>₹{order.pricing?.subtotal}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Delivery charge</span>
            <span>₹{order.pricing?.deliveryCharge}</span>
          </div>
          {order.pricing?.codTokenAmount > 0 && (
            <div className="flex justify-between text-[#C0451A] text-xs">
              <span>COD token paid</span>
              <span>−₹{order.pricing.codTokenAmount}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t">
            <span>Amount at door</span>
            <span>₹{order.pricing?.total - (order.pricing?.codTokenAmount || 0)}</span>
          </div>
        </div>
      </div>

      {/* Cancel button — only when cancellable */}
      {canCancel && (
        <div className="space-y-2">
          {cancelFeeWarning && (
            <div className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
              ⚠ {cancelFeeWarning}
            </div>
          )}
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="w-full min-h-[48px] bg-white border border-red-300 text-red-500 rounded-xl
                       text-sm font-medium active:bg-red-50 disabled:opacity-40"
          >
            {cancelling ? 'Cancelling...' : cancelLabel}
          </button>
        </div>
      )}
    </div>
  );
}
