const { adminAuth } = require('../services/firebase');

async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'No token', code: 'NO_TOKEN' });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const adminPhone = process.env.ADMIN_PHONE;

    if (decoded.phone_number !== adminPhone) {
      return res.status(403).json({ error: 'Not authorized', code: 'FORBIDDEN' });
    }

    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}

module.exports = { requireAdmin };
