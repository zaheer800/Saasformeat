export default function StatsBar({ orders, menu }) {
  const todayOrders = orders.filter((o) => o.status !== 'CANCELLED');
  const pending = orders.filter((o) => o.status === 'PENDING').length;
  const revenue = todayOrders.reduce((sum, o) => sum + (o.pricing?.total || 0), 0);

  const lowStockCount = menu.filter((item) => {
    const available = item.stockGrams - item.reservedGrams - item.soldGrams;
    return available <= item.lowStockAlertGrams && available > 0;
  }).length;

  const outOfStockCount = menu.filter((item) => {
    const available = item.stockGrams - item.reservedGrams - item.soldGrams;
    return available <= 0;
  }).length;

  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      <StatCard label="Today's Orders" value={todayOrders.length} icon="📦" />
      <StatCard label="Revenue" value={`₹${revenue}`} icon="💰" />
      <StatCard
        label="Pending"
        value={pending}
        icon="⏳"
        alert={pending > 0}
      />
      <StatCard
        label="Stock Alerts"
        value={`${outOfStockCount} out · ${lowStockCount} low`}
        icon="⚠"
        alert={outOfStockCount > 0}
      />
    </div>
  );
}

function StatCard({ label, value, icon, alert }) {
  return (
    <div className={`rounded-xl p-4 ${alert ? 'bg-red-50' : 'bg-white'} shadow-sm`}>
      <div className="text-xl mb-1">{icon}</div>
      <div className={`text-lg font-bold ${alert ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
