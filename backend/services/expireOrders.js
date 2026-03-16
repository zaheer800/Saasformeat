const { db } = require('./firebase');
const { releaseReservedStock } = require('./stock');
const { processRefund } = require('./refund');
const { shopConfig } = require('./shopConfig');

const EXPIRE_AFTER_MS = 10 * 60 * 1000; // 10 minutes
const CHECK_INTERVAL_MS = 60 * 1000;    // check every 1 minute

/**
 * Finds all PENDING orders older than 10 minutes and cancels them.
 * Releases reserved stock and processes any refund (token already paid).
 */
async function expireStaleOrders() {
  const cutoff = new Date(Date.now() - EXPIRE_AFTER_MS);

  let snapshot;
  try {
    snapshot = await db
      .collection('orders')
      .where('shopId', '==', shopConfig.slug)
      .where('status', '==', 'PENDING')
      .where('timestamps.createdAt', '<', cutoff)
      .get();
  } catch (err) {
    console.error('expireStaleOrders: query failed', err);
    return;
  }

  if (snapshot.empty) return;

  for (const docSnap of snapshot.docs) {
    const order = { id: docSnap.id, ...docSnap.data() };
    try {
      await docSnap.ref.update({
        status: 'CANCELLED',
        'pricing.cancellationFee': 0,
        'timestamps.cancelledAt': new Date(),
        cancellation: {
          reason: 'auto_expired',
          cancelledBy: 'system',
          feeCharged: 0,
        },
      });

      await releaseReservedStock(order.items);
      await processRefund(order, 0);

      console.error(`Auto-expired order ${order.id} (placed at ${order.timestamps.createdAt.toDate?.() || order.timestamps.createdAt})`);
    } catch (err) {
      console.error(`Failed to expire order ${order.id}:`, err);
    }
  }
}

/**
 * Start the expiry loop. Called once on server start.
 * Runs immediately then every CHECK_INTERVAL_MS.
 */
function startExpiryLoop() {
  expireStaleOrders();
  setInterval(expireStaleOrders, CHECK_INTERVAL_MS);
}

module.exports = { startExpiryLoop, expireStaleOrders };
