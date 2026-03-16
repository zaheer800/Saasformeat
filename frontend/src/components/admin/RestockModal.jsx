import { useState } from 'react';

export default function RestockModal({ menu, onClose, onSave }) {
  const [stocks, setStocks] = useState(
    Object.fromEntries(menu.map((item) => [item.id, item.stockGrams / 1000]))
  );
  const [loading, setLoading] = useState(false);

  function handleChange(id, kg) {
    setStocks((prev) => ({ ...prev, [id]: parseFloat(kg) || 0 }));
  }

  async function handleSubmit() {
    setLoading(true);
    const items = Object.entries(stocks).map(([id, kg]) => ({
      id,
      stockGrams: Math.round(kg * 1000),
    }));
    await onSave(items);
    setLoading(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-white w-full max-w-md mx-auto rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b">
          <h3 className="text-lg font-bold text-gray-900">Set Today's Stock</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Enter how much of each item you have today (in kg)
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {menu.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-800 flex-1">{item.name}</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={stocks[item.id]}
                  onChange={(e) => handleChange(item.id, e.target.value)}
                  className="w-20 text-right min-h-[44px] px-3 rounded-xl bg-gray-100 text-sm outline-none"
                />
                <span className="text-sm text-gray-400 w-5">kg</span>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 flex gap-3 border-t">
          <button
            onClick={onClose}
            className="flex-1 min-h-[48px] rounded-xl border border-gray-300 text-gray-600 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 min-h-[48px] bg-[#C0451A] text-white rounded-xl text-sm font-semibold
                       active:bg-[#8B2E0F] disabled:opacity-40"
          >
            {loading ? 'Saving...' : '✅ Open Shop'}
          </button>
        </div>
      </div>
    </div>
  );
}
