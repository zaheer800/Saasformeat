const router = require('express').Router();
const { db } = require('../services/firebase');
const { requireAdmin } = require('../middleware/auth');
const { shopConfig } = require('../services/shopConfig');

// GET /api/menu — Public menu with live available stock
router.get('/', async (req, res) => {
  try {
    const snapshot = await db
      .collection('menu')
      .where('shopId', '==', shopConfig.slug)
      .orderBy('sortOrder')
      .get();

    const menu = snapshot.docs.map((d) => {
      const item = { id: d.id, ...d.data() };
      item.availableGrams = item.stockGrams - item.reservedGrams - item.soldGrams;
      if (item.availableGrams <= 0) item.isAvailable = false;
      return item;
    });

    res.json(menu);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// GET /api/menu/stock-summary — Admin stock overview
router.get('/stock-summary', requireAdmin, async (req, res) => {
  try {
    const snapshot = await db
      .collection('menu')
      .where('shopId', '==', shopConfig.slug)
      .orderBy('sortOrder')
      .get();

    const summary = snapshot.docs.map((d) => {
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
        isLow: availableGrams <= item.lowStockAlertGrams && availableGrams > 0,
        isOut: availableGrams <= 0,
        lastRestockedAt: item.lastRestockedAt,
      };
    });

    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stock summary' });
  }
});

// POST /api/menu/restock — Bulk morning restock (admin)
router.post('/restock', requireAdmin, async (req, res) => {
  try {
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to restock' });
  }
});

// PATCH /api/menu/:id/stock — Set opening stock for the day (admin)
router.patch('/:id/stock', requireAdmin, async (req, res) => {
  try {
    const { stockGrams } = req.body;
    if (!stockGrams || stockGrams <= 0) {
      return res.status(400).json({ error: 'stockGrams must be a positive number' });
    }

    const ref = db.collection('menu').doc(req.params.id);
    await ref.update({
      stockGrams,
      reservedGrams: 0,
      soldGrams: 0,
      isAvailable: true,
      lastRestockedAt: new Date(),
    });

    res.json({ success: true, stockGrams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

// PATCH /api/menu/:id/toggle — Manual availability toggle (admin)
router.patch('/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const ref = db.collection('menu').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Item not found' });

    const item = doc.data();
    const availableGrams = item.stockGrams - item.reservedGrams - item.soldGrams;

    // Can't manually turn on if stock is zero
    if (!item.isAvailable && availableGrams <= 0) {
      return res.status(400).json({ error: 'Cannot enable item with zero stock' });
    }

    await ref.update({ isAvailable: !item.isAvailable });
    res.json({ isAvailable: !item.isAvailable });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle item' });
  }
});

// PATCH /api/menu/:id/price — Update price per kg (admin)
router.patch('/:id/price', requireAdmin, async (req, res) => {
  try {
    const { pricePerKg } = req.body;
    if (!pricePerKg || pricePerKg <= 0) {
      return res.status(400).json({ error: 'Invalid price' });
    }
    await db.collection('menu').doc(req.params.id).update({ pricePerKg });
    res.json({ success: true, pricePerKg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update price' });
  }
});

module.exports = router;
