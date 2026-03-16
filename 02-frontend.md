# 02 — Frontend

## Stack

- **React 18** with Vite
- **Tailwind CSS** for styling
- **React Router v6** for routing
- **Firebase SDK** (client-side) for auth
- **Zustand** for state management (cart, session)

---

## Routes

```
/                → CustomerPage  (chat ordering UI)
/admin           → AdminLogin    (OTP login)
/admin/dashboard → AdminDashboard
/track/:orderId  → TrackingPage  (public, no auth)
```

---

## Customer Chat Flow

The customer UI mimics a WhatsApp-style bot chat. It's a **finite state machine** — each screen is a "step" with messages and action buttons.

### Chat Steps

```
WELCOME
  → Show greeting + main menu (Chicken / Mutton / Fish / Eggs)

CATEGORY_SELECTED
  → Show items in category with prices

ITEM_SELECTED
  → Show cut options (curry cut, boneless, keema...)

CUT_SELECTED
  → Show weight selector (250g, 500g, 750g, 1kg, 1.5kg, 2kg)

WEIGHT_SELECTED
  → Show item summary, "Add to cart" + "Add more items"

CART_REVIEW
  → Show all cart items, total, "Proceed" button

ADDRESS_ENTRY
  → Ask for location pin or text address
  → Call /api/delivery/quote → show delivery charge

PAYMENT_SELECT
  → Show UPI and COD options
  → If COD: show ₹20 token message
  → If UPI: show Razorpay payment link (Phase 2)

ORDER_CONFIRM
  → Show order summary + order ID
  → "Track Order" button → /track/:orderId

ORDER_TRACKING
  → Live status updates from Firestore
```

### Chat Component Structure

```jsx
// CustomerPage.jsx
<ChatContainer>
  <ChatHeader shopName={config.shopName} isOpen={shop.isOpen} />
  <ChatMessages messages={chatState.messages} />
  <QuickReplies options={chatState.currentOptions} onSelect={handleSelect} />
  <ChatInput onSend={handleSend} disabled={!chatState.expectsInput} />
</ChatContainer>
```

### Chat State Management

Use Zustand store:

```javascript
// stores/chatStore.js
const useChatStore = create((set, get) => ({
  messages: [],
  step: 'WELCOME',
  cart: [],
  selectedCategory: null,
  selectedItem: null,
  selectedCut: null,
  selectedWeight: null,
  customerInfo: null,
  deliveryQuote: null,
  orderId: null,

  addMessage: (msg) => set(state => ({
    messages: [...state.messages, { ...msg, id: Date.now() }]
  })),

  goToStep: (step) => set({ step }),

  addToCart: (item) => set(state => ({
    cart: [...state.cart, item]
  })),

  clearCart: () => set({ cart: [] }),
}));
```

### Message Types

```javascript
// Bot message
{ type: 'bot', text: 'Welcome! What would you like today?' }

// User message (what customer tapped)
{ type: 'user', text: '1 kg Curry Cut' }

// Menu card (special rich message)
{ type: 'menu_card', items: [...] }

// Order summary card
{ type: 'order_card', order: {...} }
```

---

## Admin Dashboard

Protected by Firebase OTP — only the phone number registered in shop config can log in.

### Admin Components

```
AdminDashboard
├── StatsBar             (today's orders, revenue, pending count, low stock alerts)
├── OrderList
│   └── OrderCard        (accept/reject, delivery picker, status badge)
├── StockPanel
│   ├── RestockModal     (morning bulk restock — set kg per item)
│   └── StockItem        (live kg remaining, low stock warning, manual toggle)
└── BroadcastPanel       (send WhatsApp message link to customer list)
```

### StockPanel

The stock panel is the most important admin UI after orders. Owner opens it every morning to set the day's stock.

```jsx
// components/admin/StockPanel.jsx
function StockPanel({ menu }) {
  const [showRestock, setShowRestock] = useState(false);

  const lowStockItems = menu.filter(item => {
    const available = item.stockGrams - item.reservedGrams - item.soldGrams;
    return available <= item.lowStockAlertGrams && available > 0;
  });

  const outOfStockItems = menu.filter(item => {
    const available = item.stockGrams - item.reservedGrams - item.soldGrams;
    return available <= 0;
  });

  return (
    <div className="stock-panel">
      <div className="panel-header">
        <h3>Stock</h3>
        {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
          <div className="stock-alerts">
            {outOfStockItems.length > 0 && (
              <span className="alert-badge red">
                {outOfStockItems.length} sold out
              </span>
            )}
            {lowStockItems.length > 0 && (
              <span className="alert-badge yellow">
                {lowStockItems.length} running low
              </span>
            )}
          </div>
        )}
        <button onClick={() => setShowRestock(true)} className="btn-restock">
          🌅 Set Today's Stock
        </button>
      </div>

      <div className="stock-list">
        {menu.map(item => (
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
```

### StockItem

```jsx
// components/admin/StockItem.jsx
function StockItem({ item }) {
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

  return (
    <div className={`stock-item ${isOut ? 'out' : isLow ? 'low' : 'ok'}`}>
      <div className="stock-item-left">
        <div className="item-name">{item.name}</div>
        <div className="stock-bar">
          <div
            className="stock-bar-fill"
            style={{ width: `${percentLeft}%` }}
          />
        </div>
        <div className="stock-numbers">
          {isOut ? (
            <span className="tag-red">Sold out</span>
          ) : isLow ? (
            <span className="tag-yellow">⚠ {availableKg} kg left</span>
          ) : (
            <span className="tag-green">{availableKg} kg available</span>
          )}
          <span className="stock-detail">
            {reservedKg} kg reserved · {soldKg} kg sold of {totalKg} kg
          </span>
        </div>
      </div>
      <div className="stock-item-right">
        <Toggle
          isOn={item.isAvailable && !isOut}
          disabled={isOut}     // Can't turn on if stock is 0
          onChange={() => toggleItemAvailability(item.id)}
        />
      </div>
    </div>
  );
}
```

### RestockModal

This is what the owner sees every morning. Simple, fast, one tap per item.

```jsx
// components/admin/RestockModal.jsx
function RestockModal({ menu, onClose, onSave }) {
  // Pre-fill with yesterday's opening stock as a starting point
  const [stocks, setStocks] = useState(
    Object.fromEntries(menu.map(item => [item.id, item.stockGrams / 1000]))
  );

  function handleChange(id, kg) {
    setStocks(prev => ({ ...prev, [id]: parseFloat(kg) || 0 }));
  }

  async function handleSubmit() {
    const items = Object.entries(stocks).map(([id, kg]) => ({
      id,
      stockGrams: Math.round(kg * 1000),
    }));
    await onSave(items);
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>🌅 Set Today's Stock</h3>
        <p className="modal-sub">Enter how much of each item you have today (in kg)</p>

        <div className="restock-list">
          {menu.map(item => (
            <div key={item.id} className="restock-row">
              <span className="restock-name">{item.name}</span>
              <div className="restock-input-wrap">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={stocks[item.id]}
                  onChange={e => handleChange(item.id, e.target.value)}
                  className="restock-input"
                />
                <span className="restock-unit">kg</span>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="btn-cancel">Cancel</button>
          <button onClick={handleSubmit} className="btn-save">
            ✅ Open Shop with This Stock
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Real-time Stock Listener

Stock levels update live as orders come in — no page refresh needed:

```javascript
// hooks/useStock.js
export function useStock() {
  const [stockSummary, setStockSummary] = useState([]);

  useEffect(() => {
    // Listen to menu collection for live stock updates
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'menu'),
        where('shopId', '==', SHOP_ID),
        orderBy('sortOrder')
      ),
      (snapshot) => {
        const items = snapshot.docs.map(doc => {
          const data = { id: doc.id, ...doc.data() };
          // Compute available on client side
          data.availableGrams = data.stockGrams - data.reservedGrams - data.soldGrams;
          return data;
        });
        setStockSummary(items);
      }
    );
    return unsubscribe;
  }, []);

  return stockSummary;
}
```

### Customer-Facing Stock Display

Customers see available stock so they know how much they can order:

```jsx
// In the chat weight selector step
function WeightSelector({ item, onSelect }) {
  const availableGrams = item.stockGrams - item.reservedGrams - item.soldGrams;
  const maxOrderGrams = Math.min(availableGrams, 4000); // Max 4 kg per order

  // Generate weight options capped by available stock
  const steps = [];
  let w = item.minWeightGrams;
  while (w <= maxOrderGrams) {
    steps.push(w);
    w += item.weightStepsGrams;
  }

  if (steps.length === 0) {
    return <div className="msg bot">Sorry, this item is sold out. 😔</div>;
  }

  return (
    <div>
      <div className="msg bot">
        How much {item.name} would you like?
        <div className="stock-hint">
          {availableGrams <= item.lowStockAlertGrams
            ? `⚠ Only ${(availableGrams / 1000).toFixed(1)} kg left today`
            : `Available: ${(availableGrams / 1000).toFixed(1)} kg`
          }
        </div>
      </div>
      <div className="quick-replies">
        {steps.map(grams => (
          <button
            key={grams}
            className="qr"
            onClick={() => onSelect(grams)}
          >
            {grams >= 1000 ? `${grams / 1000} kg` : `${grams}g`}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### OrderCard

```jsx
// Each order shows:
// - Customer name, phone, address, distance
// - Items ordered with cut and weight
// - Total amount + delivery charge
// - Payment status (paid/pending)
// - Action buttons based on current status

function OrderCard({ order }) {
  const isNew = order.status === 'PENDING';
  const isAccepted = order.status === 'ACCEPTED';

  return (
    <div className="order-card">
      <OrderHeader order={order} />
      <OrderItems items={order.items} />
      <OrderPricing pricing={order.pricing} />

      {isNew && (
        <div className="actions">
          <button onClick={() => acceptOrder(order.id)}>✅ Accept</button>
          <button onClick={() => rejectOrder(order.id)}>✕ Reject</button>
        </div>
      )}

      {order.status === 'READY' && (
        <DeliveryPicker orderId={order.id} />
      )}
    </div>
  );
}
```

### DeliveryPicker

```jsx
// Shown after shop marks order as READY
// Shows 3 options with live quotes for Rapido/Uber

function DeliveryPicker({ orderId }) {
  const [quotes, setQuotes] = useState(null);

  useEffect(() => {
    fetchDeliveryQuotes(orderId).then(setQuotes);
  }, [orderId]);

  return (
    <div>
      <DeliveryOption
        icon="🚴"
        label="My Delivery Boy"
        sublabel="No booking needed"
        onSelect={() => assignOwnBoy(orderId)}
      />
      <DeliveryOption
        icon="🛵"
        label="Rapido"
        sublabel={quotes ? `₹${quotes.rapido.price} · ${quotes.rapido.etaMin} min` : 'Loading...'}
        onSelect={() => bookRapido(orderId)}
      />
      <DeliveryOption
        icon="🚗"
        label="Uber Direct"
        sublabel={quotes ? `₹${quotes.uber.price} · ${quotes.uber.etaMin} min` : 'Loading...'}
        onSelect={() => bookUber(orderId)}
        disabled={!quotes?.uber?.available}
      />
    </div>
  );
}
```

### Real-time Orders (Firestore listener)

```javascript
// hooks/useOrders.js
export function useOrders() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'orders'),
        where('shopId', '==', SHOP_ID),
        where('timestamps.createdAt', '>=', today),
        orderBy('timestamps.createdAt', 'desc')
      ),
      (snapshot) => {
        const orders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setOrders(orders);
      }
    );

    return unsubscribe;
  }, []);

  return orders;
}
```

---

## Shop Config (frontend)

Read from environment at build time:

```javascript
// src/config/shop.js
export const shopConfig = {
  name: import.meta.env.VITE_SHOP_NAME,
  slug: import.meta.env.VITE_SHOP_SLUG,
  phone: import.meta.env.VITE_SHOP_PHONE,
  lat: parseFloat(import.meta.env.VITE_SHOP_LAT),
  lng: parseFloat(import.meta.env.VITE_SHOP_LNG),
};
```

---

## Key UI Rules

1. **No form tags** — use button onClick and onChange handlers only
2. **Mobile-first** — all layouts designed for 360px width minimum
3. **Large tap targets** — all buttons minimum 44px height
4. **Loading states** — every API call shows a loading indicator
5. **Offline banner** — show "You're offline" if navigator.onLine is false
6. **Shop closed state** — if `shop.isOpen === false`, show closed message, disable ordering

---

## Tailwind Config Additions

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        rust: { DEFAULT: '#C0451A', light: '#E8581F', dark: '#8B2E0F' },
        gold: '#D4A843',
        shop: { cream: '#FDF6EC', warm: '#F5E6CC' }
      },
      fontFamily: {
        display: ['Playfair Display', 'serif'],
        mono: ['DM Mono', 'monospace'],
      }
    }
  }
}
```

---

## Frontend Environment Variables (.env)

```bash
VITE_SHOP_NAME="New Famous Chicken & Mutton Shop"
VITE_SHOP_SLUG="newfamous"
VITE_SHOP_PHONE="+919876543210"
VITE_SHOP_LAT=17.4234
VITE_SHOP_LNG=78.5567
VITE_API_URL=https://api.newfamous.railway.app
VITE_FIREBASE_API_KEY=AIzaxxxx
VITE_FIREBASE_AUTH_DOMAIN=newfamous-shop.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=newfamous-shop
VITE_RAZORPAY_KEY_ID=rzp_live_xxxx
```
