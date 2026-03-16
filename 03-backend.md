# 03 — Backend

## Stack

- **Node.js 20** + **Express 4**
- **Firebase Admin SDK** — Firestore reads/writes, token verification
- **Razorpay Node SDK** — payment link creation, webhook handling
- **@googlemaps/google-maps-services-js** — Distance Matrix API
- **express-rate-limit** — protect public endpoints
- **helmet** — security headers

---

## Entry Point

```javascript
// backend/index.js
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimiter } = require('./middleware/rateLimit');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());
app.use('/api', rateLimiter);

// Routes
app.use('/api/orders', require('./routes/orders'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/delivery', require('./routes/delivery'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/shop', require('./routes/shop'));

// Razorpay webhook (no rate limit, needs raw body)
app.use('/webhooks/razorpay',
  express.raw({ type: 'application/json' }),
  require('./routes/webhooks')
);

app.listen(process.env.PORT || 3001);
```

---

## Auth Middleware

All `/admin` actions require a valid Firebase ID token:

```javascript
// middleware/auth.js
const { adminAuth } = require('../services/firebase');

async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    // Only allow the registered admin phone number
    const adminPhone = process.env.ADMIN_PHONE;
    if (decoded.phone_number !== adminPhone) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAdmin };
```

---

## Orders Route

```javascript
// routes/orders.js
const router = require('express').Router();
const { db } = require('../services/firebase');
const { requireAdmin } = require('../middleware/auth');
const { getDeliveryCharge } = require('../services/googlemaps');
const { createCODTokenLink } = require('../services/razorpay');
const { isCODBlocked, recordCODAttempt } = require('../services/codRules');

// POST /api/orders — Create new order
router.post('/', async (req, res) => {
  try {
    const { customer, items, payment, notes } = req.body;

    // Validate minimum order
    const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
    if (subtotal < shopConfig.minOrderValue) {
      return res.status(400).json({
        error: `Minimum order is ₹${shopConfig.minOrderValue}`
      });
    }

    // Get delivery charge
    const quote = await getDeliveryCharge(
      customer.location.lat,
      customer.location.lng
    );
    if (!quote.withinZone) {
      return res.status(400).json({ error: 'Outside delivery zone' });
    }

    // COD rules
    if (payment.method === 'cod') {
      if (quote.distanceKm > shopConfig.cod.maxDistanceKm) {
        return res.status(400).json({ error: 'COD not available beyond 5 km' });
      }
      if (isCODBlocked(customer.phone)) {
        return res.status(400).json({ error: 'COD not available for this number' });
      }
    }

    // Build order document
    const order = {
      shopId: process.env.SHOP_SLUG,
      status: 'PENDING',
      customer,
      items,
      pricing: {
        subtotal,
        deliveryCharge: quote.charge,
        codTokenAmount: payment.method === 'cod' ? shopConfig.cod.tokenAmount : 0,
        cancellationFee: 0,
        total: subtotal + quote.charge,
      },
      payment: {
        method: payment.method,
        status: payment.method === 'cod' ? 'pending' : 'pending',
      },
      delivery: { method: null },
      timestamps: { createdAt: new Date() },
      notes: notes || '',
    };

    const docRef = await db.collection('orders').add(order);

    // Generate COD token payment link
    let tokenPaymentUrl = null;
    if (payment.method === 'cod') {
      tokenPaymentUrl = await createCODTokenLink(
        docRef.id,
        shopConfig.cod.tokenAmount,
        customer
      );
    }

    res.status(201).json({
      orderId: docRef.id,
      status: 'PENDING',
      pricing: order.pricing,
      tokenPaymentUrl,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// PATCH /api/orders/:id/status — Update order status (admin only)
router.patch('/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const orderId = req.params.id;

  const ref = db.collection('orders').doc(orderId);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: 'Order not found' });

  const order = doc.data();
  const validTransitions = getValidTransitions(order.status);

  if (!validTransitions.includes(status)) {
    return res.status(400).json({
      error: `Cannot transition from ${order.status} to ${status}`
    });
  }

  const update = { status };

  // Set timestamp for this status
  const tsKey = {
    ACCEPTED: 'acceptedAt',
    PREPARING: 'prepStartedAt',
    READY: 'readyAt',
    DISPATCHED: 'dispatchedAt',
    DELIVERED: 'deliveredAt',
  }[status];

  if (tsKey) {
    update[`timestamps.${tsKey}`] = new Date();
  }

  await ref.update(update);
  res.json({ success: true, orderId, status });
});

// POST /api/orders/:id/cancel — Cancel order
router.post('/:id/cancel', async (req, res) => {
  const { reason, cancelledBy } = req.body;
  const orderId = req.params.id;

  const ref = db.collection('orders').doc(orderId);
  const doc = await ref.get();
  const order = doc.data();

  if (['DELIVERED', 'CANCELLED', 'DISPATCHED'].includes(order.status)) {
    return res.status(400).json({ error: 'Cannot cancel this order' });
  }

  // Determine cancellation fee
  let feeCharged = 0;
  const prepStarted = order.timestamps.prepStartedAt;
  const isAfterPrep = order.status === 'PREPARING' || order.status === 'READY';

  if (cancelledBy === 'customer' && isAfterPrep) {
    feeCharged = shopConfig.cancellation.cancellationFee;
  }

  // Shop cancels = always full refund + strike
  if (cancelledBy === 'shop') {
    feeCharged = 0;
    await incrementShopStrike();
  }

  await ref.update({
    status: 'CANCELLED',
    'pricing.cancellationFee': feeCharged,
    'timestamps.cancelledAt': new Date(),
    cancellation: { reason, cancelledBy, feeCharged }
  });

  // Trigger refund (see payments doc)
  await processRefund(order, feeCharged);

  // Block COD if customer rejected at door twice
  if (reason === 'rejected_at_door') {
    await recordCODAttempt(order.customer.phone);
  }

  res.json({ success: true, feeCharged });
});

// GET /api/admin/orders — Today's orders for admin dashboard
router.get('/admin/orders', requireAdmin, async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const snapshot = await db.collection('orders')
    .where('shopId', '==', process.env.SHOP_SLUG)
    .where('timestamps.createdAt', '>=', today)
    .orderBy('timestamps.createdAt', 'desc')
    .get();

  const orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  res.json(orders);
});

// Helper — valid state transitions
function getValidTransitions(currentStatus) {
  const map = {
    PENDING:    ['ACCEPTED', 'CANCELLED'],
    ACCEPTED:   ['PREPARING', 'CANCELLED'],
    PREPARING:  ['READY', 'CANCELLED'],
    READY:      ['DISPATCHED'],
    DISPATCHED: ['DELIVERED'],
  };
  return map[currentStatus] || [];
}

module.exports = router;
```

---

## Menu Route

```javascript
// routes/menu.js
const router = require('express').Router();
const { db } = require('../services/firebase');
const { requireAdmin } = require('../middleware/auth');
const { updateStockAfterOrderChange } = require('../services/stock');

// GET /api/menu — Public menu with live available stock
router.get('/', async (req, res) => {
  const snapshot = await db.collection('menu')
    .where('shopId', '==', process.env.SHOP_SLUG)
    .orderBy('sortOrder')
    .get();

  const menu = snapshot.docs.map(d => {
    const item = { id: d.id, ...d.data() };
    // Compute availableGrams on the fly
    item.availableGrams = item.stockGrams - item.reservedGrams - item.soldGrams;
    // Auto-mark unavailable if stock is gone
    if (item.availableGrams <= 0) item.isAvailable = false;
    return item;
  });

  res.json(menu);
});

// PATCH /api/menu/:id/stock — Set opening stock for the day (admin)
router.patch('/:id/stock', requireAdmin, async (req, res) => {
  const { stockGrams } = req.body;
  if (!stockGrams || stockGrams <= 0) {
    return res.status(400).json({ error: 'stockGrams must be a positive number' });
  }

  const ref = db.collection('menu').doc(req.params.id);
  await ref.update({
    stockGrams,
    reservedGrams: 0,     // Reset reservations at restock
    soldGrams: 0,         // Reset sold at restock
    isAvailable: true,    // Re-enable on restock
    lastRestockedAt: new Date(),
  });

  res.json({ success: true, stockGrams });
});

// POST /api/menu/restock — Bulk morning restock (admin)
// Body: [{ id: "item1", stockGrams: 18000 }, { id: "item2", stockGrams: 12000 }]
router.post('/restock', requireAdmin, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array required' });
  }

  const batch = db.batch();
  const now = new Date();

  for (const { id, stockGrams } of items) {
    if (!id || !stockGrams || stockGrams <= 0) continue;
    const ref = db.collection('menu').doc(id);
    batch.update(ref, {
      stockGrams,
      reservedGrams: 0,
      soldGrams: 0,
      isAvailable: true,
      lastRestockedAt: now,
    });
  }

  await batch.commit();
  res.json({ success: true, restocked: items.length });
});

// GET /api/menu/stock-summary — Admin stock overview
router.get('/stock-summary', requireAdmin, async (req, res) => {
  const snapshot = await db.collection('menu')
    .where('shopId', '==', process.env.SHOP_SLUG)
    .orderBy('sortOrder')
    .get();

  const summary = snapshot.docs.map(d => {
    const item = d.data();
    const availableGrams = item.stockGrams - item.reservedGrams - item.soldGrams;
    return {
      id: d.id,
      name: item.name,
      stockKg: (item.stockGrams / 1000).toFixed(2),
      reservedKg: (item.reservedGrams / 1000).toFixed(2),
      soldKg: (item.soldGrams / 1000).toFixed(2),
      availableKg: (availableGrams / 1000).toFixed(2),
      isAvailable: item.isAvailable,
      isLow: availableGrams <= item.lowStockAlertGrams,
      lastRestockedAt: item.lastRestockedAt,
    };
  });

  res.json(summary);
});

// PATCH /api/menu/:id/toggle — Manual availability override (admin)
router.patch('/:id/toggle', requireAdmin, async (req, res) => {
  const ref = db.collection('menu').doc(req.params.id);
  const doc = await ref.get();
  const current = doc.data().isAvailable;
  await ref.update({ isAvailable: !current });
  res.json({ isAvailable: !current });
});

// PATCH /api/menu/:id/price — Update price (admin)
router.patch('/:id/price', requireAdmin, async (req, res) => {
  const { pricePerKg } = req.body;
  if (!pricePerKg || pricePerKg <= 0) {
    return res.status(400).json({ error: 'Invalid price' });
  }
  await db.collection('menu').doc(req.params.id).update({ pricePerKg });
  res.json({ success: true, pricePerKg });
});

module.exports = router;
```

---

## Stock Service

This is the core of weight-based stock tracking. Called whenever an order changes state.

```javascript
// services/stock.js
const { db } = require('./firebase');
const admin = require('firebase-admin');

const FieldValue = admin.firestore.FieldValue;

/**
 * Called when order is PLACED (PENDING)
 * Reserves stock for all items in the order
 */
async function reserveStock(orderItems) {
  const batch = db.batch();

  for (const item of orderItems) {
    const ref = db.collection('menu').doc(item.menuItemId);
    const doc = await ref.get();
    const menuItem = doc.data();

    const availableGrams = menuItem.stockGrams - menuItem.reservedGrams - menuItem.soldGrams;

    // Check if enough stock is available
    if (availableGrams < item.weight) {
      throw new Error(`INSUFFICIENT_STOCK:${item.menuItemId}:${item.name}`);
    }

    batch.update(ref, {
      reservedGrams: FieldValue.increment(item.weight),
    });
  }

  await batch.commit();
}

/**
 * Called when order is CANCELLED (any stage)
 * Releases reserved stock back to available
 */
async function releaseReservedStock(orderItems) {
  const batch = db.batch();

  for (const item of orderItems) {
    const ref = db.collection('menu').doc(item.menuItemId);
    batch.update(ref, {
      reservedGrams: FieldValue.increment(-item.weight),
    });
  }

  await batch.commit();
}

/**
 * Called when order is DELIVERED
 * Moves stock from reserved to permanently sold
 * Also auto-toggles item off if stock hits zero
 */
async function finaliseStock(orderItems) {
  const batch = db.batch();

  for (const item of orderItems) {
    const ref = db.collection('menu').doc(item.menuItemId);
    const doc = await ref.get();
    const menuItem = doc.data();

    const update = {
      reservedGrams: FieldValue.increment(-item.weight),  // Release reservation
      soldGrams: FieldValue.increment(item.weight),        // Mark as sold
    };

    // Auto-toggle off if available stock hits zero after this sale
    const remainingAfterSale =
      menuItem.stockGrams - (menuItem.reservedGrams - item.weight) - (menuItem.soldGrams + item.weight);

    if (remainingAfterSale <= 0) {
      update.isAvailable = false;
    }

    // Low stock alert check
    if (remainingAfterSale <= menuItem.lowStockAlertGrams && remainingAfterSale > 0) {
      console.warn(`LOW STOCK: ${menuItem.name} — only ${(remainingAfterSale / 1000).toFixed(2)} kg left`);
      // Phase 3: trigger push notification to admin here
    }

    batch.update(ref, update);
  }

  await batch.commit();
}

/**
 * Validate that all items in an order have sufficient stock
 * Called before order creation — read-only check
 */
async function validateStock(orderItems) {
  const errors = [];

  for (const item of orderItems) {
    const doc = await db.collection('menu').doc(item.menuItemId).get();
    if (!doc.exists) {
      errors.push({ item: item.name, reason: 'Item not found' });
      continue;
    }

    const menuItem = doc.data();
    if (!menuItem.isAvailable) {
      errors.push({ item: item.name, reason: 'Item is currently unavailable' });
      continue;
    }

    const availableGrams = menuItem.stockGrams - menuItem.reservedGrams - menuItem.soldGrams;
    if (availableGrams < item.weight) {
      const availableKg = (availableGrams / 1000).toFixed(2);
      errors.push({
        item: item.name,
        reason: `Only ${availableKg} kg available, you requested ${item.weight / 1000} kg`,
      });
    }
  }

  return errors; // Empty array = all good
}

module.exports = { reserveStock, releaseReservedStock, finaliseStock, validateStock };
```

---

## Updated Orders Route (Stock Integration)

Key changes — stock service is now called at every order state transition:

```javascript
// In POST /api/orders (order creation)
const { validateStock, reserveStock } = require('../services/stock');

// 1. Validate stock before creating order
const stockErrors = await validateStock(items);
if (stockErrors.length > 0) {
  return res.status(400).json({
    error: 'Some items are unavailable',
    code: 'INSUFFICIENT_STOCK',
    items: stockErrors,
  });
}

// 2. Reserve stock atomically
try {
  await reserveStock(items);
} catch (err) {
  if (err.message.startsWith('INSUFFICIENT_STOCK')) {
    return res.status(400).json({ error: 'Stock changed during checkout, please try again' });
  }
  throw err;
}

// 3. Create order document
const docRef = await db.collection('orders').add(order);
```

```javascript
// In POST /api/orders/:id/cancel
const { releaseReservedStock } = require('../services/stock');

// After marking order as CANCELLED — always release stock
await releaseReservedStock(order.items);
```

```javascript
// In PATCH /api/orders/:id/status when status = DELIVERED
const { finaliseStock } = require('../services/stock');

// When order is marked delivered — finalise stock deduction
if (status === 'DELIVERED') {
  await finaliseStock(order.items);
}
```

---

## Rate Limiting

```javascript
// middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

exports.rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window per IP
  message: { error: 'Too many requests' }
});

// Stricter limit for order creation
exports.orderLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 5,                     // 5 orders per minute per IP
  message: { error: 'Slow down' }
});
```

---

## Error Handling

```javascript
// Always return consistent error shape
res.status(400).json({
  error: 'Human-readable message',
  code: 'MACHINE_READABLE_CODE',   // optional
  field: 'items'                    // optional, for validation errors
});

// Error codes used in frontend:
// ORDER_BELOW_MINIMUM
// OUTSIDE_DELIVERY_ZONE
// COD_DISTANCE_EXCEEDED
// COD_BLOCKED
// INVALID_STATUS_TRANSITION
// SHOP_CLOSED
```
