export default function WeightSelector({ item, onSelect }) {
  const availableGrams = item.stockGrams - item.reservedGrams - item.soldGrams;
  const maxOrderGrams = Math.min(availableGrams, 4000);

  const steps = [];
  let w = item.minWeightGrams;
  while (w <= maxOrderGrams) {
    steps.push(w);
    w += item.weightStepsGrams;
  }

  const isLow = availableGrams <= item.lowStockAlertGrams && availableGrams > 0;

  return (
    <div className="px-3 py-2 space-y-2 bg-[#FDF6EC]">
      {isLow && (
        <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">
          ⚠ Only {(availableGrams / 1000).toFixed(1)} kg left today
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {steps.map((grams) => (
          <button
            key={grams}
            onClick={() => onSelect(grams)}
            className="min-h-[44px] px-4 py-2 rounded-full border border-[#C0451A] text-[#C0451A] text-sm font-medium
                       active:bg-[#C0451A] active:text-white bg-white transition-colors"
          >
            {grams >= 1000 ? `${grams / 1000} kg` : `${grams}g`}
          </button>
        ))}
      </div>
    </div>
  );
}
