const { db, admin } = require('./firebase');

const FieldValue = admin.firestore.FieldValue;

/**
 * Called when order is PLACED (PENDING).
 * Reserves stock for all items in the order.
 * Uses a transaction per item to prevent race conditions.
 */
async function reserveStock(orderItems) {
  for (const item of orderItems) {
    const ref = db.collection('menu').doc(item.menuItemId);

    await db.runTransaction(async (t) => {
      const doc = await t.get(ref);
      if (!doc.exists) throw new Error(`INSUFFICIENT_STOCK:${item.menuItemId}:${item.name}`);

      const menuItem = doc.data();
      const availableGrams = menuItem.stockGrams - menuItem.reservedGrams - menuItem.soldGrams;

      if (availableGrams < item.weight) {
        throw new Error(`INSUFFICIENT_STOCK:${item.menuItemId}:${item.name}`);
      }

      t.update(ref, { reservedGrams: FieldValue.increment(item.weight) });
    });
  }
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
 */
async function finaliseStock(orderItems) {
  const batch = db.batch();

  for (const item of orderItems) {
    const ref = db.collection('menu').doc(item.menuItemId);
    const doc = await ref.get();
    const menuItem = doc.data();

    const update = {
      reservedGrams: FieldValue.increment(-item.weight),
      soldGrams: FieldValue.increment(item.weight),
    };

    const remainingAfterSale =
      menuItem.stockGrams -
      (menuItem.reservedGrams - item.weight) -
      (menuItem.soldGrams + item.weight);

    if (remainingAfterSale <= 0) {
      update.isAvailable = false;
    }

    if (remainingAfterSale <= menuItem.lowStockAlertGrams && remainingAfterSale > 0) {
      console.error(`LOW STOCK: ${menuItem.name} — only ${(remainingAfterSale / 1000).toFixed(2)} kg left`);
    }

    batch.update(ref, update);
  }

  await batch.commit();
}

/**
 * Read-only check before order creation.
 * Returns array of errors — empty means all good.
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

  return errors;
}

module.exports = { reserveStock, releaseReservedStock, finaliseStock, validateStock };
