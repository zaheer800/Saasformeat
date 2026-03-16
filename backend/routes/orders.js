const router = require('express').Router();
const { db } = require('../services/firebase');
const { requireAdmin } = require('../middleware/auth');
const { orderLimiter } = require('../middleware/rateLimit');
const { getDeliveryCharge } = require('../services/googlemaps');
const { createCODTokenLink } = require('../services/razorpay');
const { isCODBlocked, recordCODAttempt } = require('../services/codRules');
const { validateStock, reserveStock, releaseReservedStock, finaliseStock } = require('../services/stock');
const { processRefund } = require('../services/refund');
const { incrementShopStrike } = require('../services/shopStrikes');
const { shopConfig, isShopOpen } = require('../services/shopConfig');

// POST /api/orders — Create new order
router.post('/', orderLimiter, async (req, res) => {
  try {
    const { customer, items, payment, notes } = req.body;

    if (!customer || !items || !payment) {
      return res.status(400).json({ error: 'Missing required fields', code: 'INVALID_REQUEST' });
    }

    // Check shop is open (reads from Firestore shopConfig for manual override)
    const shopDoc = await db.collection('shopConfig').doc(shopConfig.slug).get();
    const manualOpen = shopDoc.exists ? shopDoc.data().isOpen : true;
    if (!isShopOpen(manualOpen)) {
      return res.status(400).json({ error: 'Shop is currently closed', code: 'SHOP_CLOSED' });
    }

    // Validate minimum order
    const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
    if (subtotal < shopConfig.minOrderValue) {
      return res.status(400).json({
        error: `Minimum order is ₹${shopConfig.minOrderValue}`,
        code: 'ORDER_BELOW_MINIMUM',
      });
    }

    // Get delivery charge
    const quote = await getDeliveryCharge(
      customer.location.lat,
      customer.location.lng
    );
    if (!quote.withinZone) {
      return res.status(400).json({ error: 'Outside delivery zone', code: 'OUTSIDE_DELIVERY_ZONE' });
    }

    // COD rules
    if (payment.method === 'cod') {
      if (quote.distanceKm > shopConfig.cod.maxDistanceKm) {
        return res.status(400).json({
          error: 'COD not available beyond 5 km',
          code: 'COD_DISTANCE_EXCEEDED',
        });
      }
      if (await isCODBlocked(customer.phone)) {
        return res.status(400).json({
          error: 'COD not available for this number',
          code: 'COD_BLOCKED',
        });
      }
    }

    // Validate stock before reserving
    const stockErrors = await validateStock(items);
    if (stockErrors.length > 0) {
      return res.status(400).json({
        error: 'Some items are unavailable',
        code: 'INSUFFICIENT_STOCK',
        items: stockErrors,
      });
    }

    // Reserve stock atomically
    try {
      await reserveStock(items);
    } catch (err) {
      if (err.message.startsWith('INSUFFICIENT_STOCK')) {
        return res.status(400).json({
          error: 'Stock changed during checkout, please try again',
          code: 'INSUFFICIENT_STOCK',
        });
      }
      throw err;
    }

    // Build order document
    const order = {
      shopId: shopConfig.slug,
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
        status: 'pending',
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
      await docRef.update({ 'payment.tokenPaymentUrl': tokenPaymentUrl });
    }

    res.status(201).json({
      orderId: docRef.id,
      status: 'PENDING',
      pricing: order.pricing,
      tokenPaymentUrl,
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET /api/orders/:id — Get order by ID (customer)
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('orders').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Order not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

// PATCH /api/orders/:id/status — Update order status (admin only)
router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;

    const ref = db.collection('orders').doc(orderId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Order not found' });

    const order = doc.data();
    const validTransitions = getValidTransitions(order.status);

    if (!validTransitions.includes(status)) {
      return res.status(400).json({
        error: `Cannot transition from ${order.status} to ${status}`,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    const tsKey = {
      ACCEPTED: 'acceptedAt',
      PREPARING: 'prepStartedAt',
      READY: 'readyAt',
      DISPATCHED: 'dispatchedAt',
      DELIVERED: 'deliveredAt',
    }[status];

    const update = { status };
    if (tsKey) update[`timestamps.${tsKey}`] = new Date();

    // Finalise stock when delivered
    if (status === 'DELIVERED') {
      await finaliseStock(order.items);
    }

    await ref.update(update);
    res.json({ success: true, orderId, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// POST /api/orders/:id/cancel — Cancel order
router.post('/:id/cancel', async (req, res) => {
  try {
    const { reason, cancelledBy } = req.body;
    const orderId = req.params.id;

    const ref = db.collection('orders').doc(orderId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Order not found' });

    const order = doc.data();
    order.id = orderId;

    if (['DELIVERED', 'CANCELLED', 'DISPATCHED'].includes(order.status)) {
      return res.status(400).json({ error: 'Cannot cancel this order' });
    }

    // Calculate cancellation fee
    let feeCharged = 0;
    const isAfterPrep = order.status === 'PREPARING' || order.status === 'READY';

    if (cancelledBy === 'customer' && isAfterPrep) {
      feeCharged = shopConfig.cancellation.cancellationFee;
    }

    if (cancelledBy === 'customer' && order.status === 'ACCEPTED') {
      const acceptedAt = order.timestamps.acceptedAt?.toDate?.() || new Date();
      const minutesSince = (Date.now() - acceptedAt.getTime()) / 1000 / 60;
      if (minutesSince > shopConfig.cancellation.freeCancelWindowMinutes) {
        feeCharged = shopConfig.cancellation.cancellationFee;
      }
    }

    if (cancelledBy === 'shop') {
      feeCharged = 0;
      await incrementShopStrike();
    }

    await ref.update({
      status: 'CANCELLED',
      'pricing.cancellationFee': feeCharged,
      'timestamps.cancelledAt': new Date(),
      cancellation: { reason, cancelledBy, feeCharged },
    });

    // Release reserved stock
    await releaseReservedStock(order.items);

    // Process refund if payment was made
    await processRefund(order, feeCharged);

    // Block COD if customer rejected at door
    if (reason === 'rejected_at_door') {
      await recordCODAttempt(order.customer.phone);
    }

    res.json({ success: true, feeCharged });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// GET /api/orders/admin/orders — Today's orders (admin only)
router.get('/admin/orders', requireAdmin, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const snapshot = await db
      .collection('orders')
      .where('shopId', '==', shopConfig.slug)
      .where('timestamps.createdAt', '>=', today)
      .orderBy('timestamps.createdAt', 'desc')
      .get();

    const orders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

function getValidTransitions(currentStatus) {
  const map = {
    PENDING: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY', 'CANCELLED'],
    READY: ['DISPATCHED'],
    DISPATCHED: ['DELIVERED'],
  };
  return map[currentStatus] || [];
}

module.exports = router;
