const router = require('express').Router();
const { db } = require('../services/firebase');
const { requireAdmin } = require('../middleware/auth');
const { shopConfig } = require('../services/shopConfig');

// GET /api/shop/config — Get shop config (public)
router.get('/config', async (req, res) => {
  try {
    const doc = await db.collection('shopConfig').doc(shopConfig.slug).get();

    const config = {
      name: shopConfig.name,
      phone: shopConfig.phone,
      address: shopConfig.address,
      location: shopConfig.location,
      deliveryZoneKm: shopConfig.deliveryZoneKm,
      minOrderValue: shopConfig.minOrderValue,
      cod: {
        enabled: shopConfig.cod.enabled,
        maxDistanceKm: shopConfig.cod.maxDistanceKm,
        tokenAmount: shopConfig.cod.tokenAmount,
      },
      workingHours: shopConfig.workingHours,
      isOpen: doc.exists ? doc.data().isOpen : true,
    };

    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch shop config' });
  }
});

// PATCH /api/shop/toggle — Open or close shop manually (admin)
router.patch('/toggle', requireAdmin, async (req, res) => {
  try {
    const ref = db.collection('shopConfig').doc(shopConfig.slug);
    const doc = await ref.get();
    const currentIsOpen = doc.exists ? doc.data().isOpen : true;
    const newIsOpen = !currentIsOpen;

    await ref.set({ isOpen: newIsOpen }, { merge: true });
    res.json({ isOpen: newIsOpen });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle shop status' });
  }
});

module.exports = router;
