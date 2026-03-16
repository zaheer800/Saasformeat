/**
 * Tests for backend/services/expireOrders.js
 */

const ORDER_ITEMS = [{ menuItemId: 'chicken', name: 'Chicken', weight: 500 }];

// ─── Mock dependencies ────────────────────────────────────────────────────────

jest.mock('../../services/firebase', () => ({
  db: {
    collection: jest.fn((name) => ({
      where: jest.fn().mockReturnThis(),
      get: jest.fn(),
    })),
  },
  admin: { firestore: { FieldValue: {} } },
}));

jest.mock('../../services/stock', () => ({
  releaseReservedStock: jest.fn().mockResolvedValue(),
}));

jest.mock('../../services/refund', () => ({
  processRefund: jest.fn().mockResolvedValue(),
}));

jest.mock('../../services/shopConfig', () => ({
  shopConfig: { slug: 'test-shop' },
}));

// Flush all pending microtasks (awaits all queued promises)
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const { expireStaleOrders } = require('../../services/expireOrders');
const { db } = require('../../services/firebase');
const { releaseReservedStock } = require('../../services/stock');
const { processRefund } = require('../../services/refund');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStaleOrderDoc(id, items = ORDER_ITEMS) {
  return {
    id,
    ref: {
      update: jest.fn().mockResolvedValue(),
    },
    data: () => ({
      items,
      timestamps: { createdAt: { toDate: () => new Date(Date.now() - 15 * 60 * 1000) } },
      payment: { method: 'cod', status: 'pending' },
      pricing: { total: 170 },
    }),
  };
}

function mockQuery(docs) {
  db.collection.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ empty: docs.length === 0, docs }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('expireStaleOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('cancels a stale PENDING order and releases stock', async () => {
    const staleDoc = makeStaleOrderDoc('order-stale-1');
    mockQuery([staleDoc]);

    await expireStaleOrders();

    expect(staleDoc.ref.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'CANCELLED',
        'pricing.cancellationFee': 0,
        cancellation: expect.objectContaining({
          reason: 'auto_expired',
          cancelledBy: 'system',
        }),
      })
    );
    expect(releaseReservedStock).toHaveBeenCalledWith(ORDER_ITEMS);
    expect(processRefund).toHaveBeenCalled();
  });

  test('does nothing when snapshot is empty', async () => {
    mockQuery([]);

    await expireStaleOrders();

    expect(releaseReservedStock).not.toHaveBeenCalled();
    expect(processRefund).not.toHaveBeenCalled();
  });

  test('swallows Firestore query error without throwing', async () => {
    db.collection.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockRejectedValue(new Error('Firestore unavailable')),
    });

    await expect(expireStaleOrders()).resolves.not.toThrow();
  });

  test('processes multiple stale orders', async () => {
    const docs = [makeStaleOrderDoc('order-1'), makeStaleOrderDoc('order-2')];
    mockQuery(docs);

    await expireStaleOrders();

    expect(docs[0].ref.update).toHaveBeenCalledTimes(1);
    expect(docs[1].ref.update).toHaveBeenCalledTimes(1);
    expect(releaseReservedStock).toHaveBeenCalledTimes(2);
    expect(processRefund).toHaveBeenCalledTimes(2);
  });
});
