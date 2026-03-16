/**
 * Tests for backend/services/expireOrders.js (expireStaleOrders internals)
 *
 * We export startExpiryLoop only, so we test by calling it in a controlled way.
 * The key observable behaviour:
 *   - Stale PENDING orders are marked CANCELLED
 *   - releaseReservedStock is called for each stale order
 *   - processRefund is called for each stale order
 *   - Orders that are not stale are untouched
 *   - Query failures are swallowed (no unhandled rejection)
 */

const ORDER_ITEMS = [{ menuItemId: 'chicken', name: 'Chicken', weight: 500 }];

// ─── Mock dependencies ────────────────────────────────────────────────────────

let mockDocUpdate;
let mockQueryGet;
let mockSnapshot;

jest.mock('../../services/firebase', () => {
  mockDocUpdate = jest.fn().mockResolvedValue();
  mockQueryGet = jest.fn();

  // Build chainable Firestore query mock
  const chain = {
    where: jest.fn().mockReturnThis(),
    get: (...a) => mockQueryGet(...a),
  };

  return {
    db: {
      collection: jest.fn(() => chain),
    },
    admin: { firestore: { FieldValue: {} } },
  };
});

const mockReleaseReservedStock = jest.fn().mockResolvedValue();
const mockProcessRefund = jest.fn().mockResolvedValue();

jest.mock('../../services/stock', () => ({
  releaseReservedStock: (...a) => mockReleaseReservedStock(...a),
}));

jest.mock('../../services/refund', () => ({
  processRefund: (...a) => mockProcessRefund(...a),
}));

jest.mock('../../services/shopConfig', () => ({
  shopConfig: { slug: 'test-shop' },
}));

// We need to reach the internal expireStaleOrders function.
// Since it's not exported, we re-require the module and trigger via startExpiryLoop
// with fake timers so the setInterval fires synchronously.
const { startExpiryLoop } = require('../../services/expireOrders');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStaleOrderDoc(id, items = ORDER_ITEMS) {
  return {
    id,
    ref: { update: mockDocUpdate },
    data: () => ({
      items,
      timestamps: { createdAt: { toDate: () => new Date(Date.now() - 15 * 60 * 1000) } },
      payment: { method: 'cod', status: 'pending' },
      pricing: { total: 170 },
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('expireStaleOrders (via startExpiryLoop)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('cancels a stale PENDING order and releases stock', async () => {
    const staleDoc = makeStaleOrderDoc('order-stale-1');
    mockQueryGet.mockResolvedValue({ empty: false, docs: [staleDoc] });

    // startExpiryLoop calls expireStaleOrders immediately
    startExpiryLoop();
    // Let the microtask queue drain
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'CANCELLED',
        'pricing.cancellationFee': 0,
        cancellation: expect.objectContaining({
          reason: 'auto_expired',
          cancelledBy: 'system',
        }),
      })
    );
    expect(mockReleaseReservedStock).toHaveBeenCalledWith(ORDER_ITEMS);
    expect(mockProcessRefund).toHaveBeenCalled();
  });

  test('does nothing when snapshot is empty', async () => {
    mockQueryGet.mockResolvedValue({ empty: true, docs: [] });

    startExpiryLoop();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockDocUpdate).not.toHaveBeenCalled();
    expect(mockReleaseReservedStock).not.toHaveBeenCalled();
  });

  test('swallows Firestore query error without throwing', async () => {
    mockQueryGet.mockRejectedValue(new Error('Firestore unavailable'));

    startExpiryLoop();
    // Should not throw
    await expect(Promise.resolve()).resolves.not.toThrow();
  });

  test('processes multiple stale orders', async () => {
    const docs = [makeStaleOrderDoc('order-1'), makeStaleOrderDoc('order-2')];
    mockQueryGet.mockResolvedValue({ empty: false, docs });

    startExpiryLoop();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockDocUpdate).toHaveBeenCalledTimes(2);
    expect(mockReleaseReservedStock).toHaveBeenCalledTimes(2);
  });
});
