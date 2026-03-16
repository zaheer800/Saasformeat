import Toggle from '../shared/Toggle';
import { api } from '../../lib/api';
import useAuthStore from '../../stores/authStore';
import { useState } from 'react';

export default function StockItem({ item }) {
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(false);

  const availableGrams = item.stockGrams - item.reservedGrams - item.soldGrams;
  const availableKg = (availableGrams / 1000).toFixed(2);
  const soldKg = (item.soldGrams / 1000).toFixed(2);
  const reservedKg = (item.reservedGrams / 1000).toFixed(2);
  const totalKg = (item.stockGrams / 1000).toFixed(2);
  const percentLeft = item.stockGrams > 0
    ? Math.max(0, (availableGrams / item.stockGrams) * 100)
    : 0;

  const isOut = availableGrams <= 0;
  const isLow = availableGrams <= item.lowStockAlertGrams && availableGrams > 0;

  async function handleToggle() {
    setLoading(true);
    try {
      await api.toggleMenuItem(item.id, token);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl ${
      isOut ? 'bg-red-50' : isLow ? 'bg-amber-50' : 'bg-white'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-gray-900">{item.name}</div>

        {/* Stock bar */}
        <div className="h-1.5 bg-gray-200 rounded-full mt-1.5 mb-1">
          <div
            className={`h-1.5 rounded-full transition-all ${
              isOut ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-green-500'
            }`}
            style={{ width: `${percentLeft}%` }}
          />
        </div>

        <div className="text-xs space-y-0.5">
          {isOut ? (
            <span className="text-red-500 font-medium">Sold out</span>
          ) : isLow ? (
            <span className="text-amber-600 font-medium">⚠ {availableKg} kg left</span>
          ) : (
            <span className="text-green-600 font-medium">{availableKg} kg available</span>
          )}
          <div className="text-gray-400">
            {reservedKg} kg reserved · {soldKg} kg sold of {totalKg} kg
          </div>
        </div>
      </div>

      <Toggle
        isOn={item.isAvailable && !isOut}
        disabled={isOut || loading}
        onChange={handleToggle}
      />
    </div>
  );
}
