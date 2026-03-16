const router = require('express').Router();
const crypto = require('crypto');
const { db } = require('../services/firebase');

// POST /webhooks/razorpay
router.post('/', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = req.body;

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
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
