# 01 — Architecture

## Data Models

### Order

```typescript
interface Order {
  id: string;                    // Auto-generated Firestore ID
  shopId: string;                // Which shop this order belongs to
  status: OrderStatus;           // See order states below
  customer: {
    name: string;
    phone: string;               // Used for SMS and COD blocking
    address: string;             // Text address
    location: {
      lat: number;
      lng: number;
    };
  };
  items: OrderItem[];
  pricing: {
    subtotal: number;            // Sum of items
    deliveryCharge: number;      // Calculated by Google Maps
    codTokenAmount: number;      // ₹20 if COD, else 0
    cancellationFee: number;     // ₹50 if cancelled after prep
    total: number;               // subtotal + deliveryCharge
  };
  payment: {
    method: 'upi' | 'cod';
    status: 'pending' | 'token_paid' | 'paid' | 'refunded' | 'partial_refund';
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    tokenPaymentId?: string;     // For COD token advance
  };
  delivery: {
    method: 'own_boy' | 'rapido' | 'uber' | null;
    partnerId?: string;          // Rapido/Uber booking ID
    trackingUrl?: string;
    deliveryBoyPhone?: string;   // For own boy
  };
  timestamps: {
    createdAt: Timestamp;
    acceptedAt?: Timestamp;
    prepStartedAt?: Timestamp;
    dispatchedAt?: Timestamp;
    deliveredAt?: Timestamp;
    cancelledAt?: Timestamp;
  };
  cancellation?: {
    reason: string;
    cancelledBy: 'customer' | 'shop';
    feeCharged: number;
  };
  notes?: string;                // Customer special instructions
}
```

### OrderItem

```typescript
interface OrderItem {
  menuItemId: string;
  name: string;
  category: 'chicken' | 'mutton' | 'fish' | 'eggs' | 'other';
  cut?: string;                  // e.g. "curry_cut", "boneless", "keema"
  weight: number;                // In grams
  pricePerKg: number;
  totalPrice: number;            // (weight / 1000) * pricePerKg
}
```

### MenuItem

```typescript
interface MenuItem {
  id: string;
  shopId: string;
  name: string;
  nameHi?: string;               // Hindi name
  nameTe?: string;               // Telugu name
  category: 'chicken' | 'mutton' | 'fish' | 'eggs' | 'other';
  cuts: Cut[];                   // Available cut options
  pricePerKg: number;
  minWeightGrams: number;        // e.g. 250
  weightStepsGrams: number;      // e.g. 250 (so steps: 250, 500, 750, 1000...)

  // --- Weight-based stock tracking ---
  stockGrams: number;            // Opening stock set by owner each morning (in grams)
  reservedGrams: number;         // Locked by PENDING + ACCEPTED orders (not yet deducted)
  soldGrams: number;             // Permanently deducted on DELIVERED orders
  availableGrams: number;        // stockGrams - reservedGrams - soldGrams (computed)
  lowStockAlertGrams: number;    // Alert threshold e.g. 2000 (2 kg)
  isAvailable: boolean;          // Auto-set false when availableGrams <= 0, manual override allowed
  lastRestockedAt: Timestamp;    // When owner last set opening stock

  imageUrl?: string;
  sortOrder: number;
}

interface Cut {
  id: string;                    // e.g. "curry_cut"
  label: string;                 // e.g. "Curry Cut"
  priceModifier: number;         // e.g. 20 means ₹20 more per kg
}
```

### Stock Lifecycle per Order

```
Order PLACED (PENDING)
  → reservedGrams += orderWeightGrams     (stock held, not deducted yet)

Order ACCEPTED
  → no change (still reserved)

Order CANCELLED (any stage before DISPATCHED)
  → reservedGrams -= orderWeightGrams     (stock released back)

Order DELIVERED
  → reservedGrams -= orderWeightGrams     (release reservation)
  → soldGrams     += orderWeightGrams     (permanently deduct)

availableGrams = stockGrams - reservedGrams - soldGrams
  → if availableGrams <= 0: isAvailable = false (auto)
  → if availableGrams <= lowStockAlertGrams: send low stock alert
```

### Shop Config

```typescript
interface ShopConfig {
  id: string;
  name: string;
  slug: string;                  // URL-safe name e.g. "newfamous"
  phone: string;
  address: string;
  location: { lat: number; lng: number; };
  deliveryZoneKm: number;        // Max delivery radius e.g. 6
  deliverySlabs: DeliverySlab[];
  minOrderValue: number;         // e.g. 150
  cod: {
    enabled: boolean;
    maxDistanceKm: number;       // e.g. 5
    tokenAmount: number;         // e.g. 20
    blockedPhones: string[];     // Phones with COD blocked
  };
  cancellation: {
    freeCancelWindowMinutes: number;  // e.g. 2
    cancellationFee: number;          // e.g. 50
  };
  workingHours: {
    open: string;                // e.g. "07:00"
    close: string;               // e.g. "20:00"
  };
  isOpen: boolean;               // Manual open/close toggle
}

interface DeliverySlab {
  minKm: number;
  maxKm: number;
  charge: number;
}
```

---

## Order States

```
PENDING          → Customer placed, awaiting shop acceptance
ACCEPTED         → Shop accepted, within 2-min free cancel window
PREPARING        → Prep started, cancellation fee applies now
READY            → Ready for pickup by delivery partner
DISPATCHED       → Out for delivery
DELIVERED        → Completed
CANCELLED        → Cancelled (by customer or shop)
```

### State Machine

```
PENDING
  ├── shop accepts       → ACCEPTED
  ├── shop rejects       → CANCELLED (full refund)
  └── auto-expire 10min  → CANCELLED (full refund)

ACCEPTED
  ├── within 2 min       → customer can cancel → CANCELLED (full refund)
  └── after 2 min        → PREPARING (cancellation fee now applies)

PREPARING
  ├── customer cancels   → CANCELLED (₹50 fee, rest refunded)
  ├── shop cancels       → CANCELLED (full refund + shop strike)
  └── shop marks ready   → READY

READY
  ├── delivery assigned  → DISPATCHED
  └── no cancellation allowed

DISPATCHED
  └── shop marks done    → DELIVERED
```

---

## API Routes

### Orders

```
POST   /api/orders              Create new order
GET    /api/orders/:id          Get order by ID (customer)
PATCH  /api/orders/:id/status   Update status (admin only)
POST   /api/orders/:id/cancel   Cancel order
GET    /api/admin/orders        List today's orders (admin)
```

### Menu & Stock

```
GET    /api/menu                       Get full menu with live stock levels (public)
PATCH  /api/menu/:id/toggle            Manual toggle availability on/off (admin)
PATCH  /api/menu/:id/price             Update price per kg (admin)
PATCH  /api/menu/:id/stock             Set opening stock in grams for today (admin)
POST   /api/menu/restock               Bulk set opening stock for all items (admin morning routine)
GET    /api/menu/stock-summary         Today's stock levels across all items (admin)
```

### Delivery

```
POST   /api/delivery/quote      Get distance + charge for address
POST   /api/delivery/book       Book Rapido/Uber for order (admin)
```

### Auth

```
POST   /api/auth/verify         Verify Firebase OTP token
GET    /api/auth/me             Get current admin user
```

### Shop

```
GET    /api/shop/config         Get shop config (public)
PATCH  /api/shop/toggle         Open/close shop (admin)
```

---

## Request / Response Examples

### Create Order

```json
POST /api/orders
{
  "customer": {
    "name": "Rahul",
    "phone": "9876543210",
    "address": "Plot 12, Tarnaka",
    "location": { "lat": 17.4201, "lng": 78.5541 }
  },
  "items": [
    {
      "menuItemId": "chicken_curry_cut",
      "cut": "curry_cut",
      "weight": 1000,
      "pricePerKg": 240
    }
  ],
  "payment": { "method": "cod" },
  "notes": "Less spicy please"
}

Response 201:
{
  "orderId": "abc123",
  "status": "PENDING",
  "pricing": {
    "subtotal": 240,
    "deliveryCharge": 35,
    "codTokenAmount": 20,
    "total": 275
  },
  "tokenPaymentUrl": "https://rzp.io/l/xxxxx"
}
```

### Get Delivery Quote

```json
POST /api/delivery/quote
{
  "customerLat": 17.4201,
  "customerLng": 78.5541
}

Response 200:
{
  "distanceKm": 3.2,
  "durationMinutes": 12,
  "charge": 35,
  "withinZone": true
}
```

---

## Environment Variables

```bash
# App
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://yourshop.vercel.app

# Shop identity
SHOP_NAME="New Famous Chicken & Mutton Shop"
SHOP_SLUG="newfamous"
SHOP_LAT=17.4234
SHOP_LNG=78.5567

# Firebase (client's project)
FIREBASE_PROJECT_ID=newfamous-shop
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."

# Razorpay (client's account)
RAZORPAY_KEY_ID=rzp_live_xxxx
RAZORPAY_KEY_SECRET=xxxx

# Google Maps (client's billing account)
GOOGLE_MAPS_API_KEY=AIzaxxxx

# Rapido (Phase 2)
RAPIDO_API_KEY=xxxx
RAPIDO_MERCHANT_ID=xxxx

# SMS (Phase 2, optional)
MSG91_AUTH_KEY=xxxx
MSG91_SENDER_ID=MEATSH
```
