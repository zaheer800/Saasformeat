const { db, admin } = require('./firebase');

const FieldValue = admin.firestore.FieldValue;

/**
 * Called when order is PLACED (PENDING).
 * Reserves stock for all items in a single atomic transaction.
 *
 * A single transaction ensures:
 * - All reads happen at the same logical time (no stale stock reads)
 * - Either ALL items are reserved or NONE (no partial reservations on failure)
 * - Firestore retries automatically if any doc was concurrently modified
 *
 * The previous per-item loop was wrong: if order has chicken + mutton and
 * chicken committed but mutton failed, chicken stock was permanently locked
 * with no way to roll it back.
 */
async function reserveStock(orderItems) {
  const refs = orderItems.map((item) => db.collection('menu').doc(item.menuItemId));

  await db.runTransaction(async (t) => {
    // Read all docs inside the transaction first (Firestore requires all reads
    // before any writes within a transaction)
    const docs = await Promise.all(refs.map((ref) => t.get(ref)));

    // Validate every item before writing anything
    for (let i = 0; i < orderItems.length; i++) {
      const item = orderItems[i];
      const doc = docs[i];

      if (!doc.exists) {
        throw new Error(`INSUFFICIENT_STOCK:${item.menuItemId}:${item.name}`);
      }

      const menuItem = doc.data();
      const availableGrams = menuItem.stockGrams - menuItem.reservedGrams - menuItem.soldGrams;

      if (availableGrams < item.weight) {
        throw new Error(`INSUFFICIENT_STOCK:${item.menuItemId}:${item.name}`);
      }
    }

    // All items have sufficient stock — write all increments atomically
    for (let i = 0; i < orderItems.length; i++) {
      t.update(refs[i], { reservedGrams: FieldValue.increment(orderItems[i].weight) });
    }
  });
}

/**
 * Called when order is CANCELLED (any stage).
 * Releases reserved stock back to available.
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
 * Called when order is DELIVERED.
 * Moves stock from reserved to permanently sold.
 * Auto-toggles item off if available stock hits zero.
 *
 * Uses a transaction (not a batch) so the remainingAfterSale calculation is
 * based on the current committed values at write time, not stale reads.
 */
async function finaliseStock(orderItems) {
  const refs = orderItems.map((item) => db.collection('menu').doc(item.menuItemId));

  await db.runTransaction(async (t) => {
    const docs = await Promise.all(refs.map((ref) => t.get(ref)));

    for (let i = 0; i < orderItems.length; i++) {
      const item = orderItems[i];
      const doc = docs[i];
      if (!doc.exists) continue;

      const menuItem = doc.data();

      const remainingAfterSale =
        menuItem.stockGrams -
        (menuItem.reservedGrams - item.weight) -
        (menuItem.soldGrams + item.weight);

      const update = {
        reservedGrams: FieldValue.increment(-item.weight),
        soldGrams: FieldValue.increment(item.weight),
      };

      if (remainingAfterSale <= 0) {
        update.isAvailable = false;
      }

      if (remainingAfterSale <= menuItem.lowStockAlertGrams && remainingAfterSale > 0) {
        console.error(`LOW STOCK: ${menuItem.name} — only ${(remainingAfterSale / 1000).toFixed(2)} kg left`);
      }

      t.update(refs[i], update);
    }
  });
}

module.exports = { reserveStock, releaseReservedStock, finaliseStock };
