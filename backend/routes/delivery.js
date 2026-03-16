const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { getDeliveryCharge } = require('../services/googlemaps');
const { db } = require('../services/firebase');

// POST /api/delivery/quote — Get distance + charge for address
router.post('/quote', async (req, res) => {
  try {
    const { customerLat, customerLng } = req.body;

    if (!customerLat || !customerLng) {
      return res.status(400).json({ error: 'customerLat and customerLng are required' });
    }

    const quote = await getDeliveryCharge(customerLat, customerLng);
    res.json(quote);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate delivery charge' });
  }
});

// POST /api/delivery/assign-own-boy — Assign own delivery boy (admin, Phase 1)
router.post('/assign-own-boy', requireAdmin, async (req, res) => {
  try {
    const { orderId, deliveryBoyPhone } = req.body;

    const ref = db.collection('orders').doc(orderId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Order not found' });

    if (doc.data().status !== 'READY') {
      return res.status(400).json({ error: 'Order must be READY before assigning delivery' });
    }

    await ref.update({
      'delivery.method': 'own_boy',
      'delivery.deliveryBoyPhone': deliveryBoyPhone || null,
      status: 'DISPATCHED',
      'timestamps.dispatchedAt': new Date(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign delivery' });
  }
});

module.exports = router;
