# 05 — Payments (Razorpay)

## Phase 1 — COD Token Only

In Phase 1, only COD is supported. A ₹20 token is collected upfront to confirm intent.

```javascript
// services/razorpay.js
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create a ₹20 token payment link for COD confirmation
async function createCODTokenLink(orderId, tokenAmount, customer) {
  const paymentLink = await razorpay.paymentLink.create({
    amount: tokenAmount * 100,     // Razorpay uses paise
    currency: 'INR',
    description: `Order confirmation token — Order #${orderId}`,
    customer: {
      name: customer.name,
      contact: customer.phone,
    },
    notify: { sms: true },
    reminder_enable: false,
    notes: { orderId, type: 'cod_token' },
    callback_url: `${process.env.FRONTEND_URL}/track/${orderId}`,
    callback_method: 'get',
  });

  return paymentLink.short_url;
}

module.exports = { razorpay, createCODTokenLink };
```

## Phase 2 — Full UPI Payment

```javascript
// Create full order payment link
async function createOrderPaymentLink(orderId, amount, customer) {
  const paymentLink = await razorpay.paymentLink.create({
    amount: amount * 100,
    currency: 'INR',
    description: `Order #${orderId} — ${process.env.SHOP_NAME}`,
    customer: {
      name: customer.name,
      contact: customer.phone,
    },
    notify: { sms: true },
    notes: { orderId, type: 'full_payment' },
    callback_url: `${process.env.FRONTEND_URL}/track/${orderId}`,
    callback_method: 'get',
    expire_by: Math.floor(Date.now() / 1000) + (30 * 60), // Expires in 30 min
  });

  return paymentLink.short_url;
}
```

## Razorpay Webhook

```javascript
// routes/webhooks.js
const crypto = require('crypto');

router.post('/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const body = req.body;

  // Verify signature
  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  if (signature !== expectedSig) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(body);

  if (event.event === 'payment_link.paid') {
    const { orderId, type } = event.payload.payment_link.entity.notes;
    const paymentId = event.payload.payment.entity.id;

    if (type === 'cod_token') {
      await db.collection('orders').doc(orderId).update({
        'payment.status': 'token_paid',
        'payment.tokenPaymentId': paymentId,
      });
    }

    if (type === 'full_payment') {
      await db.collection('orders').doc(orderId).update({
        'payment.status': 'paid',
        'payment.razorpayPaymentId': paymentId,
      });
    }
  }

  res.json({ received: true });
});
```

## Refund Logic

```javascript
// services/refund.js
async function processRefund(order, cancellationFee) {
  const paymentId = order.payment.razorpayPaymentId || order.payment.tokenPaymentId;
  if (!paymentId) return; // No payment made yet, nothing to refund

  const totalPaid = order.payment.method === 'cod'
    ? order.pricing.codTokenAmount
    : order.pricing.total;

  const refundAmount = totalPaid - cancellationFee;

  if (refundAmount > 0) {
    await razorpay.payments.refund(paymentId, {
      amount: refundAmount * 100,  // paise
      notes: { orderId: order.id, reason: 'order_cancelled' }
    });
  }

  await db.collection('orders').doc(order.id).update({
    'payment.status': cancellationFee > 0 ? 'partial_refund' : 'refunded',
  });
}
```

---

# 06 — Delivery

## Google Maps Distance Calculation

```javascript
// services/googlemaps.js
const { Client } = require('@googlemaps/google-maps-services-js');
const client = new Client({});

const SHOP_LAT = parseFloat(process.env.SHOP_LAT);
const SHOP_LNG = parseFloat(process.env.SHOP_LNG);

const DELIVERY_SLABS = [
  { minKm: 0,  maxKm: 2, charge: 20 },
  { minKm: 2,  maxKm: 4, charge: 35 },
  { minKm: 4,  maxKm: 6, charge: 50 },
  { minKm: 6,  maxKm: 8, charge: 70 },
];

const MAX_DELIVERY_KM = 8;

async function getDeliveryCharge(customerLat, customerLng) {
  const response = await client.distancematrix({
    params: {
      origins: [`${SHOP_LAT},${SHOP_LNG}`],
      destinations: [`${customerLat},${customerLng}`],
      mode: 'driving',
      key: process.env.GOOGLE_MAPS_API_KEY,
    }
  });

  const element = response.data.rows[0].elements[0];

  if (element.status !== 'OK') {
    throw new Error('Could not calculate distance');
  }

  const distanceKm = element.distance.value / 1000;   // metres to km
  const durationMin = Math.ceil(element.duration.value / 60); // seconds to min

  if (distanceKm > MAX_DELIVERY_KM) {
    return { withinZone: false, distanceKm, charge: 0, durationMinutes: 0 };
  }

  const slab = DELIVERY_SLABS.find(
    s => distanceKm >= s.minKm && distanceKm < s.maxKm
  ) || DELIVERY_SLABS[DELIVERY_SLABS.length - 1];

  return {
    withinZone: true,
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMinutes: durationMin,
    charge: slab.charge,
  };
}

module.exports = { getDeliveryCharge };
```

## Rapido Business API (Phase 2)

```javascript
// services/rapido.js
const axios = require('axios');

const rapidoClient = axios.create({
  baseURL: 'https://api.rapido.bike/v1/business',
  headers: {
    'Authorization': `Bearer ${process.env.RAPIDO_API_KEY}`,
    'merchant-id': process.env.RAPIDO_MERCHANT_ID,
  }
});

// Get quote before booking
async function getRapidoQuote(order) {
  const res = await rapidoClient.post('/quote', {
    pickup: {
      lat: parseFloat(process.env.SHOP_LAT),
      lng: parseFloat(process.env.SHOP_LNG),
      address: process.env.SHOP_ADDRESS,
    },
    drop: {
      lat: order.customer.location.lat,
      lng: order.customer.location.lng,
      address: order.customer.address,
    },
    package_weight: 2,   // kg estimate
  });

  return {
    price: res.data.estimated_fare,
    etaMinutes: res.data.pickup_eta_minutes,
    available: res.data.available,
  };
}

// Book after shop confirms delivery method
async function bookRapido(order) {
  const res = await rapidoClient.post('/booking', {
    pickup: {
      lat: parseFloat(process.env.SHOP_LAT),
      lng: parseFloat(process.env.SHOP_LNG),
      address: process.env.SHOP_ADDRESS,
      contact_name: process.env.SHOP_NAME,
      contact_phone: process.env.SHOP_PHONE,
    },
    drop: {
      lat: order.customer.location.lat,
      lng: order.customer.location.lng,
      address: order.customer.address,
      contact_name: order.customer.name,
      contact_phone: order.customer.phone,
    },
    order_id: order.id,
    collect_payment: order.payment.method === 'cod'
      ? order.pricing.total - order.pricing.codTokenAmount  // Remaining after token
      : 0,
  });

  return {
    bookingId: res.data.booking_id,
    trackingUrl: res.data.tracking_url,
    captainName: res.data.captain?.name,
    captainPhone: res.data.captain?.phone,
  };
}

module.exports = { getRapidoQuote, bookRapido };
```

---

# 07 — Deployment

## Per-Client Deployment Checklist

### Step 1 — Collect from client
- [ ] Shop name, address, phone
- [ ] Menu items + prices + cut options
- [ ] Logo image (PNG, square, min 512px)
- [ ] Delivery zone preference (default 6 km)
- [ ] Admin phone number (for OTP login)
- [ ] Bank account details (for Razorpay KYC)

### Step 2 — Create client accounts (they do this, you guide)
- [ ] Firebase project at console.firebase.google.com
- [ ] Vercel account at vercel.com (free)
- [ ] Railway account at railway.app (free tier)
- [ ] Razorpay account at razorpay.com (needs GST/PAN)
- [ ] Google Cloud account for Maps API (needs credit card, stays on free tier)
- [ ] Domain name (Namecheap/GoDaddy, ~₹800/yr)

### Step 3 — Configure Firebase
- [ ] Enable Firestore (asia-south1 region)
- [ ] Enable Auth → Phone provider
- [ ] Add test phone number for development
- [ ] Deploy security rules: `firebase deploy --only firestore:rules`
- [ ] Create required indexes (see 04-firebase.md)
- [ ] Run seed script: `node scripts/seedMenu.js`
- [ ] Download service account JSON

### Step 4 — Configure environment files

```bash
# .env for backend (Railway)
SHOP_NAME="New Famous Chicken & Mutton Shop"
SHOP_SLUG="newfamous"
SHOP_PHONE="+919876543210"
SHOP_ADDRESS="Tarnaka, Hyderabad"
SHOP_LAT=17.4234
SHOP_LNG=78.5567
ADMIN_PHONE="+919876543210"
FRONTEND_URL=https://newfamous.vercel.app
FIREBASE_PROJECT_ID=newfamous-shop
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
RAZORPAY_KEY_ID=rzp_live_xxxx
RAZORPAY_KEY_SECRET=xxxx
RAZORPAY_WEBHOOK_SECRET=xxxx
GOOGLE_MAPS_API_KEY=AIzaxxxx
```

```bash
# .env for frontend (Vercel)
VITE_SHOP_NAME="New Famous Chicken & Mutton Shop"
VITE_SHOP_SLUG="newfamous"
VITE_SHOP_PHONE="+919876543210"
VITE_SHOP_LAT=17.4234
VITE_SHOP_LNG=78.5567
VITE_API_URL=https://newfamous-api.up.railway.app
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=newfamous-shop.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=newfamous-shop
VITE_RAZORPAY_KEY_ID=rzp_live_xxxx
```

### Step 5 — Deploy backend to Railway
```bash
# In client's Railway account, create new project
# Connect to your GitHub repo (give them read access to the repo)
# Set root directory to /backend
# Add all env vars from above
# Railway auto-deploys on push
```

### Step 6 — Deploy frontend to Vercel
```bash
# In client's Vercel account, import GitHub repo
# Set root directory to /frontend
# Set framework: Vite
# Add all VITE_ env vars
# Set custom domain: newfamous.com → Vercel
# Vercel auto-deploys on push
```

### Step 7 — Register Razorpay Webhook
- Go to Razorpay Dashboard → Webhooks
- Add URL: `https://newfamous-api.up.railway.app/webhooks/razorpay`
- Events: `payment_link.paid`
- Copy webhook secret → add to backend env as `RAZORPAY_WEBHOOK_SECRET`

### Step 8 — Test end to end
- [ ] Customer visits link → sees menu
- [ ] Adds item to cart → enters address → sees delivery charge
- [ ] Places COD order → gets token payment link
- [ ] Pays ₹20 token → order appears in admin dashboard
- [ ] Admin accepts order → status updates for customer
- [ ] Admin marks ready → assigns own delivery boy
- [ ] Admin marks delivered → order complete

---

# 08 — Business Rules

## COD Rules

```javascript
// services/codRules.js
async function isCODBlocked(phone) {
  const doc = await db.collection('customers').doc(phone).get();
  if (!doc.exists) return false;
  return doc.data().codBlocked === true;
}

async function recordCODAttempt(phone) {
  const ref = db.collection('customers').doc(phone);
  const doc = await ref.get();

  if (!doc.exists) {
    await ref.set({ doorRejections: 1, codBlocked: false });
    return;
  }

  const rejections = (doc.data().doorRejections || 0) + 1;
  const codBlocked = rejections >= 2;  // Block after 2 rejections

  await ref.update({ doorRejections: rejections, codBlocked });
}
```

## Shop Strike System

```javascript
async function incrementShopStrike() {
  const today = new Date().toISOString().split('T')[0]; // "2026-03-16"
  const ref = db.collection('shopStrikes').doc(today);
  const doc = await ref.get();

  const current = doc.exists ? doc.data().count : 0;
  await ref.set({ count: current + 1, date: today });

  // Alert if 3+ strikes today
  if (current + 1 >= 3) {
    console.warn(`⚠️ Shop has ${current + 1} cancellations today`);
    // TODO: Send alert to developer's phone
  }
}
```

## Cancellation Fee Timing

```javascript
function shouldChargeCancellationFee(order, cancelledBy) {
  if (cancelledBy === 'shop') return false;       // Shop cancels = always free
  if (order.status === 'PENDING') return false;   // Not accepted yet = free
  if (order.status === 'ACCEPTED') {
    // Check if within 2-minute free window
    const acceptedAt = order.timestamps.acceptedAt.toDate();
    const now = new Date();
    const minutesSinceAccept = (now - acceptedAt) / 1000 / 60;
    return minutesSinceAccept > shopConfig.cancellation.freeCancelWindowMinutes;
  }
  // PREPARING or READY = always charge
  return true;
}
```

## Shop Open/Close

```javascript
// Automatic close check on every order creation
function isShopOpen(shopConfig) {
  if (!shopConfig.isOpen) return false;  // Manual override

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  return currentTime >= shopConfig.workingHours.open &&
         currentTime < shopConfig.workingHours.close;
}
```

## Delivery COD Restrictions

```javascript
// COD is only allowed with own delivery boy
// If shop selects Rapido/Uber, payment must be UPI

function validateDeliveryPaymentCombination(deliveryMethod, paymentMethod) {
  if (paymentMethod === 'cod' && deliveryMethod !== 'own_boy') {
    throw new Error('COD is only available with own delivery boy');
  }
  return true;
}
```

---

# Quick Reference — Claude Code Prompts

Use these prompts when working with Claude Code on this project:

## Starting a session
```
Read all files in /docs before starting. This is a hyperlocal meat shop 
delivery app. The shop owns their own Firebase/Vercel/Razorpay accounts. 
We are building Phase 1 only. COD with token advance, own delivery boy, 
no UPI payments yet.
```

## Adding a feature
```
Add [feature] to the [frontend/backend]. Follow the patterns in 
[relevant doc file]. Keep Phase 1 scope — no Rapido API, no UPI yet.
```

## Debugging
```
The order creation endpoint is returning [error]. 
Check 03-backend.md for the expected flow and 04-firebase.md 
for the Firestore schema.
```

## Deploying for a new client
```
Deploy this app for a new client: [shop name, location, menu items].
Follow the checklist in 07-deployment.md. Their admin phone is [number].
```
