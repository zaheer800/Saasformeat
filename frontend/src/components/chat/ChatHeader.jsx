export default function ChatHeader({ shopName, isOpen }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#C0451A] text-white shadow-md">
      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
        🥩
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{shopName}</div>
        <div className="flex items-center gap-1.5 text-xs text-white/80">
          <span
            className={`w-2 h-2 rounded-full ${isOpen ? 'bg-green-400' : 'bg-red-400'}`}
          />
          {isOpen ? 'Open now · Taking orders' : 'Closed · Not taking orders'}
        </div>
      </div>
    </div>
  );
}
