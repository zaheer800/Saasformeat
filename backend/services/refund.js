const { razorpay } = require('./razorpay');
const { db } = require('./firebase');

async function processRefund(order, cancellationFee) {
  const paymentId = order.payment.razorpayPaymentId || order.payment.tokenPaymentId;
  if (!paymentId) return; // No payment made yet

  const totalPaid =
    order.payment.method === 'cod'
      ? order.pricing.codTokenAmount
      : order.pricing.total;

  const refundAmount = totalPaid - cancellationFee;

  if (refundAmount > 0) {
    await razorpay.payments.refund(paymentId, {
      amount: refundAmount * 100, // paise
      notes: { orderId: order.id, reason: 'order_cancelled' },
    });
  }

  await db.collection('orders').doc(order.id).update({
    'payment.status': cancellationFee > 0 ? 'partial_refund' : 'refunded',
  });
}

module.exports = { processRefund };
