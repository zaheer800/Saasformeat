/**
 * Tests for backend/services/stock.js
 *
 * Mocks the firebase service so no real Firestore connection is needed.
 * The key invariants we verify:
 *   1. reserveStock validates ALL items before writing ANY (atomicity)
 *   2. reserveStock throws INSUFFICIENT_STOCK if any item is short
 *   3. releaseReservedStock decrements reservedGrams for every item
 *   4. finaliseStock moves weight from reservedGrams → soldGrams
 *   5. finaliseStock sets isAvailable=false when stock hits zero
 */

// ─── Mock firebase before requiring the module under test ───────────────────

let mockTGet;
let mockTUpdate;
let mockBatchUpdate;
let mockBatchCommit;
let mockRunTransaction;

jest.mock('../../services/firebase', () => {
  mockTGet = jest.fn();
  mockTUpdate = jest.fn();
  mockBatchUpdate = jest.fn();
  mockBatchCommit = jest.fn().mockResolvedValue();
  mockRunTransaction = jest.fn(async (fn) => fn({ get: mockTGet, update: mockTUpdate }));

  return {
    db: {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn((id) => ({ id, path: `menu/${id}` })),
      }),
      runTransaction: (...args) => mockRunTransaction(...args),
      batch: jest.fn(() => ({ update: mockBatchUpdate, commit: mockBatchCommit })),
    },
    admin: {
      firestore: {
        FieldValue: {
          increment: jest.fn((n) => ({ _increment: n })),
        },
      },
    },
  };
});

const { reserveStock, releaseReservedStock, finaliseStock } = require('../../services/stock');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDocSnap(data) {
  return { exists: true, data: () => data };
}

const CHICKEN = { menuItemId: 'chicken', name: 'Chicken', weight: 500 };
const MUTTON = { menuItemId: 'mutton', name: 'Mutton', weight: 300 };

// ─── reserveStock ─────────────────────────────────────────────────────────────

describe('reserveStock', () => {
  test('reserves stock when all items have sufficient grams', async () => {
    mockTGet
      .mockResolvedValueOnce(makeDocSnap({ stockGrams: 2000, reservedGrams: 0, soldGrams: 0 }))
      .mockResolvedValueOnce(makeDocSnap({ stockGrams: 1000, reservedGrams: 0, soldGrams: 0 }));

    await expect(reserveStock([CHICKEN, MUTTON])).resolves.not.toThrow();
    expect(mockTUpdate).toHaveBeenCalledTimes(2);
    // Each call increments reservedGrams by item.weight
    expect(mockTUpdate).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      { reservedGrams: { _increment: 500 } }
    );
    expect(mockTUpdate).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { reservedGrams: { _increment: 300 } }
    );
  });

  test('throws INSUFFICIENT_STOCK when first item is short', async () => {
    mockTGet
      .mockResolvedValueOnce(makeDocSnap({ stockGrams: 100, reservedGrams: 0, soldGrams: 0 })) // only 100g available
      .mockResolvedValueOnce(makeDocSnap({ stockGrams: 1000, reservedGrams: 0, soldGrams: 0 }));

    // Simulate the transaction fn running and throwing
    mockRunTransaction.mockImplementationOnce(async (fn) => fn({ get: mockTGet, update: mockTUpdate }));

    await expect(reserveStock([CHICKEN, MUTTON])).rejects.toThrow('INSUFFICIENT_STOCK');
    // No writes should have happened
    expect(mockTUpdate).not.toHaveBeenCalled();
  });

  test('throws INSUFFICIENT_STOCK when second item is short (atomicity)', async () => {
    mockTGet
      .mockResolvedValueOnce(makeDocSnap({ stockGrams: 2000, reservedGrams: 0, soldGrams: 0 })) // chicken ok
      .mockResolvedValueOnce(makeDocSnap({ stockGrams: 100, reservedGrams: 0, soldGrams: 0 })); // mutton short

    mockRunTransaction.mockImplementationOnce(async (fn) => fn({ get: mockTGet, update: mockTUpdate }));

    await expect(reserveStock([CHICKEN, MUTTON])).rejects.toThrow('INSUFFICIENT_STOCK');
    // Crucially, chicken must NOT be written either
    expect(mockTUpdate).not.toHaveBeenCalled();
  });

  test('throws INSUFFICIENT_STOCK when doc does not exist', async () => {
    mockTGet.mockResolvedValueOnce({ exists: false });

    mockRunTransaction.mockImplementationOnce(async (fn) => fn({ get: mockTGet, update: mockTUpdate }));

    await expect(reserveStock([CHICKEN])).rejects.toThrow('INSUFFICIENT_STOCK');
  });

  test('accounts for already-reserved and sold grams', async () => {
    // stockGrams=1000, reserved=600, sold=200 → available=200; requesting 500 → should fail
    mockTGet.mockResolvedValueOnce(
      makeDocSnap({ stockGrams: 1000, reservedGrams: 600, soldGrams: 200 })
    );

    mockRunTransaction.mockImplementationOnce(async (fn) => fn({ get: mockTGet, update: mockTUpdate }));

    await expect(reserveStock([CHICKEN])).rejects.toThrow('INSUFFICIENT_STOCK');
    expect(mockTUpdate).not.toHaveBeenCalled();
  });

  test('succeeds when available equals requested weight exactly', async () => {
    // available = 2000 - 1000 - 500 = 500; requesting exactly 500
    mockTGet.mockResolvedValueOnce(
      makeDocSnap({ stockGrams: 2000, reservedGrams: 1000, soldGrams: 500 })
    );

    await expect(reserveStock([CHICKEN])).resolves.not.toThrow();
    expect(mockTUpdate).toHaveBeenCalledTimes(1);
  });
});

// ─── releaseReservedStock ─────────────────────────────────────────────────────

describe('releaseReservedStock', () => {
  test('decrements reservedGrams for every item in a batch', async () => {
    await releaseReservedStock([CHICKEN, MUTTON]);

    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      { reservedGrams: { _increment: -500 } }
    );
    expect(mockBatchUpdate).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { reservedGrams: { _increment: -300 } }
    );
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  test('commits empty batch without error for empty order', async () => {
    await expect(releaseReservedStock([])).resolves.not.toThrow();
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });
});

// ─── finaliseStock ────────────────────────────────────────────────────────────

describe('finaliseStock', () => {
  test('moves weight from reservedGrams to soldGrams', async () => {
    mockTGet.mockResolvedValueOnce(
      makeDocSnap({
        stockGrams: 2000,
        reservedGrams: 500,
        soldGrams: 0,
        lowStockAlertGrams: 100,
      })
    );

    await finaliseStock([CHICKEN]);

    expect(mockTUpdate).toHaveBeenCalledWith(expect.anything(), {
      reservedGrams: { _increment: -500 },
      soldGrams: { _increment: 500 },
    });
  });

  test('sets isAvailable=false when remaining stock hits zero', async () => {
    // After sale: remaining = 500 - (0 - 500) - (0 + 500) = 0
    mockTGet.mockResolvedValueOnce(
      makeDocSnap({
        stockGrams: 500,
        reservedGrams: 500,
        soldGrams: 0,
        lowStockAlertGrams: 100,
      })
    );

    await finaliseStock([CHICKEN]);

    expect(mockTUpdate).toHaveBeenCalledWith(expect.anything(), {
      reservedGrams: { _increment: -500 },
      soldGrams: { _increment: 500 },
      isAvailable: false,
    });
  });

  test('does NOT set isAvailable=false when stock remains', async () => {
    mockTGet.mockResolvedValueOnce(
      makeDocSnap({
        stockGrams: 2000,
        reservedGrams: 500,
        soldGrams: 0,
        lowStockAlertGrams: 100,
      })
    );

    await finaliseStock([CHICKEN]);

    const call = mockTUpdate.mock.calls[0][1];
    expect(call).not.toHaveProperty('isAvailable');
  });

  test('skips missing docs without throwing', async () => {
    mockTGet.mockResolvedValueOnce({ exists: false });

    await expect(finaliseStock([CHICKEN])).resolves.not.toThrow();
    expect(mockTUpdate).not.toHaveBeenCalled();
  });
});
