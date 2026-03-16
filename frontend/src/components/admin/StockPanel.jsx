import { useState } from 'react';
import StockItem from './StockItem';
import RestockModal from './RestockModal';
import { api } from '../../lib/api';
import useAuthStore from '../../stores/authStore';

export default function StockPanel({ menu }) {
  const token = useAuthStore((s) => s.token);
  const [showRestock, setShowRestock] = useState(false);

  const lowStockItems = menu.filter((item) => {
    const available = item.stockGrams - item.reservedGrams - item.soldGrams;
    return available <= item.lowStockAlertGrams && available > 0;
  });

  const outOfStockItems = menu.filter((item) => {
    const available = item.stockGrams - item.reservedGrams - item.soldGrams;
    return available <= 0;
  });

  async function handleRestock(items) {
    try {
      await api.restockMenu(items, token);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="px-4 pb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-900">Stock</h2>
        <div className="flex items-center gap-2">
          {outOfStockItems.length > 0 && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
              {outOfStockItems.length} sold out
            </span>
          )}
          {lowStockItems.length > 0 && (
            <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-medium">
              {lowStockItems.length} low
            </span>
          )}
          <button
            onClick={() => setShowRestock(true)}
            className="min-h-[36px] px-3 bg-[#C0451A] text-white rounded-xl text-xs font-semibold"
          >
            🌅 Set Stock
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {menu.map((item) => (
          <StockItem key={item.id} item={item} />
        ))}
      </div>

      {showRestock && (
        <RestockModal
          menu={menu}
          onClose={() => setShowRestock(false)}
          onSave={handleRestock}
        />
      )}
    </div>
  );
}
