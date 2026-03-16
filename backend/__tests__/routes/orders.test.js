/**
 * Integration tests for order routes.
 *
 * All external services are mocked; no real Firebase / Razorpay / Google Maps
 * calls are made.
 */

process.env.SHOP_SLUG = 'test-shop';
process.env.SHOP_NAME = 'Test Meat Shop';
process.env.SHOP_PHONE = '+919000000000';
process.env.SHOP_ADDRESS = '123 Test St';
process.env.SHOP_LAT = '17.3850';
process.env.SHOP_LNG = '78.4867';
process.env.ADMIN_PHONE = '+919111111111';

const request = require('supertest');

// ─── Mocks (must be defined before app is required) ───────────────────────────

// jest.mock factories are hoisted, so we cannot use `let` vars assigned inside
// them from outside. Instead we expose helpers via the module reference.

jest.mock('../../services/firebase', () => ({
  db: {
    collection: jest.fn((name) => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        update: jest.fn().mockResolvedValue(),
      })),
      add: jest.fn(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    })),
    runTransaction: jest.fn(async (fn) =>
      fn({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ stockGrams: 5000, reservedGrams: 0, soldGrams: 0 }),
        }),
        update: jest.fn(),
      })
    ),
    batch: jest.fn(() => ({
      update: jest.fn(),
      commit: jest.fn().mockResolvedValue(),
    })),
  },
  admin: {
    firestore: { FieldValue: { increment: jest.fn((n) => ({ _increment: n })) } },
  },
  adminAuth: {
    verifyIdToken: jest.fn().mockResolvedValue({ phone_number: '+919111111111' }),
  },
}));

jest.mock('../../services/googlemaps', () => ({
  getDeliveryCharge: jest.fn().mockResolvedValue({ withinZone: true, charge: 35, distanceKm: 3 }),
}));

jest.mock('../../services/razorpay', () => ({
  createCODTokenLink: jest.fn().mockResolvedValue('https://rzp.io/test-link'),
}));

jest.mock('../../services/codRules', () => ({
  isCODBlocked: jest.fn().mockResolvedValue(false),
  recordCODAttempt: jest.fn().mockResolvedValue(),
}));

jest.mock('../../services/refund', () => ({
  processRefund: jest.fn().mockResolvedValue(),
}));

jest.mock('../../services/shopStrikes', () => ({
  incrementShopStrike: jest.fn().mockResolvedValue(),
}));

jest.mock('../../services/expireOrders', () => ({
  startExpiryLoop: jest.fn(),
}));

// Disable rate limiting in tests
jest.mock('../../middleware/rateLimit', () => ({
  rateLimiter: (req, res, next) => next(),
  orderLimiter: (req, res, next) => next(),
}));

// Load app after all mocks are set up
const app = require('../../app');

// Grab mocked module references for per-test customisation
const { db } = require('../../services/firebase');
const googlemaps = require('../../services/googlemaps');
const codRules = require('../../services/codRules');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_BODY = {
  customer: {
    name: 'Ravi Kumar',
    phone: '+919876543210',
    location: { lat: 17.385, lng: 78.4867, address: '456 Main Rd' },
  },
  items: [{ menuItemId: 'chicken', name: 'Chicken', weight: 500, totalPrice: 200 }],
  payment: { method: 'cod' },
  notes: '',
};

function shopOpen() {
  // db.collection('shopConfig').doc(slug).get()
  // The mock returns the same doc() stub for every collection; we need to set
  // the resolved value of `.get()` on the shopConfig doc.
  db.collection.mockImplementation((name) => ({
    doc: jest.fn(() => ({
      get: jest.fn().mockResolvedValue(
        name === 'shopConfig'
          ? { exists: true, data: () => ({ isOpen: true }) }
          : { exists: true, data: () => ({}) }
      ),
      update: jest.fn().mockResolvedValue(),
      id: 'mock-id',
    })),
    add: jest.fn().mockResolvedValue({ id: 'order-abc', update: jest.fn().mockResolvedValue() }),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: [] }),
  }));
}

function shopClosed() {
  db.collection.mockImplementation((name) => ({
    doc: jest.fn(() => ({
      get: jest.fn().mockResolvedValue(
        name === 'shopConfig'
          ? { exists: true, data: () => ({ isOpen: false }) }
          : { exists: true, data: () => ({}) }
      ),
      update: jest.fn().mockResolvedValue(),
      id: 'mock-id',
    })),
    add: jest.fn().mockResolvedValue({ id: 'order-abc', update: jest.fn().mockResolvedValue() }),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: [] }),
  }));
}

// ─── POST /api/orders ─────────────────────────────────────────────────────────

describe('POST /api/orders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    shopOpen();
    googlemaps.getDeliveryCharge.mockResolvedValue({ withinZone: true, charge: 35, distanceKm: 3 });
    codRules.isCODBlocked.mockResolvedValue(false);
    db.runTransaction.mockImplementation(async (fn) =>
      fn({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ stockGrams: 5000, reservedGrams: 0, soldGrams: 0 }),
        }),
        update: jest.fn(),
      })
    );
  });

  test('201 — creates a COD order successfully', async () => {
    const res = await request(app).post('/api/orders').send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.orderId).toBeDefined();
    expect(res.body.status).toBe('PENDING');
    expect(res.body.tokenPaymentUrl).toBe('https://rzp.io/test-link');
  });

  test('400 INVALID_REQUEST — missing required fields', async () => {
    const res = await request(app).post('/api/orders').send({ customer: VALID_BODY.customer });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
  });

  test('400 SHOP_CLOSED — when shop is manually closed', async () => {
    shopClosed();
    const res = await request(app).post('/api/orders').send(VALID_BODY);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SHOP_CLOSED');
  });

  test('400 ORDER_BELOW_MINIMUM — subtotal below ₹150', async () => {
    const body = {
      ...VALID_BODY,
      items: [{ menuItemId: 'chicken', name: 'Chicken', weight: 200, totalPrice: 80 }],
    };
    const res = await request(app).post('/api/orders').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ORDER_BELOW_MINIMUM');
  });

  test('400 OUTSIDE_DELIVERY_ZONE — location outside zone', async () => {
    googlemaps.getDeliveryCharge.mockResolvedValueOnce({ withinZone: false });
    const res = await request(app).post('/api/orders').send(VALID_BODY);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OUTSIDE_DELIVERY_ZONE');
  });

  test('400 COD_DISTANCE_EXCEEDED — COD order beyond 5km', async () => {
    googlemaps.getDeliveryCharge.mockResolvedValueOnce({ withinZone: true, charge: 70, distanceKm: 7 });
    const res = await request(app).post('/api/orders').send(VALID_BODY);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COD_DISTANCE_EXCEEDED');
  });

  test('400 COD_BLOCKED — blocked phone', async () => {
    codRules.isCODBlocked.mockResolvedValueOnce(true);
    const res = await request(app).post('/api/orders').send(VALID_BODY);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COD_BLOCKED');
  });

  test('400 INSUFFICIENT_STOCK — transaction throws', async () => {
    db.runTransaction.mockRejectedValueOnce(
      new Error('INSUFFICIENT_STOCK:chicken:Chicken')
    );
    const res = await request(app).post('/api/orders').send(VALID_BODY);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
  });
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────

describe('GET /api/orders/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('200 — returns order data', async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          exists: true,
          id: 'order-xyz',
          data: () => ({ status: 'PENDING', customer: { name: 'Ravi' } }),
        }),
      })),
    });

    const res = await request(app).get('/api/orders/order-xyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING');
  });

  test('404 — unknown order ID', async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false }),
      })),
    });

    const res = await request(app).get('/api/orders/unknown-id');
    expect(res.status).toBe(404);
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
