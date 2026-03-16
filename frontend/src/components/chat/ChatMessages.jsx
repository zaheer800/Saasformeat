import { useEffect, useRef } from 'react';

export default function ChatMessages({ messages }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 bg-[#FDF6EC]">
      {messages.map((msg) => (
        <Message key={msg.id} msg={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function Message({ msg }) {
  if (msg.type === 'bot') {
    return (
      <div className="flex items-end gap-2 max-w-[85%]">
        <div className="w-7 h-7 rounded-full bg-[#C0451A] text-white text-xs flex items-center justify-center shrink-0 mb-1">
          🥩
        </div>
        <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm text-sm text-gray-800 leading-relaxed">
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.type === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-[#C0451A] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm max-w-[75%]">
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.type === 'order_card') {
    return (
      <div className="flex items-end gap-2 max-w-[90%]">
        <div className="w-7 h-7 rounded-full bg-[#C0451A] text-white text-xs flex items-center justify-center shrink-0 mb-1">
          🥩
        </div>
        <div className="bg-white rounded-2xl rounded-tl-sm shadow-sm overflow-hidden w-full">
          <div className="bg-[#C0451A] px-4 py-2 text-white text-sm font-semibold">
            Order #{msg.order.orderId}
          </div>
          <div className="px-4 py-3 space-y-1 text-sm text-gray-700">
            {msg.order.items?.map((item, i) => (
              <div key={i} className="flex justify-between">
                <span>{item.name} ({item.cut}) — {item.weight >= 1000 ? `${item.weight / 1000} kg` : `${item.weight}g`}</span>
                <span className="font-medium">₹{item.totalPrice}</span>
              </div>
            ))}
            <div className="border-t pt-2 mt-2 space-y-1">
              <div className="flex justify-between text-gray-500">
                <span>Delivery</span>
                <span>₹{msg.order.pricing?.deliveryCharge}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-900">
                <span>Total</span>
                <span>₹{msg.order.pricing?.total}</span>
              </div>
              {msg.order.pricing?.codTokenAmount > 0 && (
                <div className="flex justify-between text-[#C0451A] text-xs">
                  <span>Token advance (COD)</span>
                  <span>₹{msg.order.pricing.codTokenAmount}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
