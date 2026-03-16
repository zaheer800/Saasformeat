import { useState } from 'react';

export default function ChatInput({ onSend, disabled, placeholder = 'Type your address...' }) {
  const [value, setValue] = useState('');

  function handleSend() {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue('');
  }

  if (disabled) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white border-t border-gray-200">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        placeholder={placeholder}
        className="flex-1 min-h-[44px] px-4 rounded-full bg-gray-100 text-sm outline-none"
      />
      <button
        onClick={handleSend}
        disabled={!value.trim()}
        className="w-11 h-11 rounded-full bg-[#C0451A] text-white flex items-center justify-center
                   disabled:opacity-40 active:bg-[#8B2E0F]"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
        </svg>
      </button>
    </div>
  );
}
