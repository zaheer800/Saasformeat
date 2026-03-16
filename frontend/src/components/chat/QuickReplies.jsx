export default function QuickReplies({ options, onSelect, disabled }) {
  if (!options || options.length === 0) return null;

  return (
    <div className="px-3 py-2 flex flex-wrap gap-2 bg-[#FDF6EC]">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => !disabled && onSelect(opt)}
          disabled={disabled || opt.disabled}
          className="min-h-[44px] px-4 py-2 rounded-full border border-[#C0451A] text-[#C0451A] text-sm font-medium
                     active:bg-[#C0451A] active:text-white transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed
                     bg-white"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
