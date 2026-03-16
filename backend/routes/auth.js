const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');

// POST /api/auth/verify — Verify Firebase OTP token (called after frontend OTP login)
router.post('/verify', requireAdmin, (req, res) => {
  // requireAdmin middleware already verified the token and admin phone
  res.json({ success: true, phone: req.admin.phone_number });
});

// GET /api/auth/me — Get current admin user info
router.get('/me', requireAdmin, (req, res) => {
  res.json({
    phone: req.admin.phone_number,
    uid: req.admin.uid,
  });
});

module.exports = router;
