/**
 * Tests for backend/services/codRules.js
 *
 * Business rules:
 *   - isCODBlocked returns false for unknown phone
 *   - isCODBlocked returns true only when codBlocked===true in Firestore
 *   - recordCODAttempt creates doc with doorRejections:1 for new phone
 *   - recordCODAttempt increments doorRejections; blocks after 2nd rejection
 */

let mockGet;
let mockSet;
let mockUpdate;
let mockDocRef;

jest.mock('../../services/firebase', () => {
  mockGet = jest.fn();
  mockSet = jest.fn().mockResolvedValue();
  mockUpdate = jest.fn().mockResolvedValue();
  mockDocRef = { get: () => mockGet(), set: (...a) => mockSet(...a), update: (...a) => mockUpdate(...a) };

  return {
    db: {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn(() => mockDocRef),
      }),
    },
    admin: { firestore: { FieldValue: {} } },
  };
});

const { isCODBlocked, recordCODAttempt } = require('../../services/codRules');

// ─── isCODBlocked ─────────────────────────────────────────────────────────────

describe('isCODBlocked', () => {
  test('returns false for unknown phone (doc does not exist)', async () => {
    mockGet.mockResolvedValue({ exists: false });
    await expect(isCODBlocked('+919999999999')).resolves.toBe(false);
  });

  test('returns false when codBlocked is false', async () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({ codBlocked: false }) });
    await expect(isCODBlocked('+919999999999')).resolves.toBe(false);
  });

  test('returns true when codBlocked is true', async () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({ codBlocked: true }) });
    await expect(isCODBlocked('+919999999999')).resolves.toBe(true);
  });

  test('returns false (safe default) when Firestore throws', async () => {
    mockGet.mockRejectedValue(new Error('network error'));
    await expect(isCODBlocked('+919999999999')).resolves.toBe(false);
  });
});

// ─── recordCODAttempt ─────────────────────────────────────────────────────────

describe('recordCODAttempt', () => {
  test('creates doc with doorRejections:1 for new phone', async () => {
    mockGet.mockResolvedValue({ exists: false });

    await recordCODAttempt('+919999999999');

    expect(mockSet).toHaveBeenCalledWith({ doorRejections: 1, codBlocked: false });
  });

  test('increments doorRejections to 1 (no block yet)', async () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({ doorRejections: 0, codBlocked: false }) });

    await recordCODAttempt('+919999999999');

    expect(mockUpdate).toHaveBeenCalledWith({ doorRejections: 1, codBlocked: false });
  });

  test('blocks phone after 2nd door rejection', async () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({ doorRejections: 1, codBlocked: false }) });

    await recordCODAttempt('+919999999999');

    expect(mockUpdate).toHaveBeenCalledWith({ doorRejections: 2, codBlocked: true });
  });

  test('keeps codBlocked true on subsequent rejections', async () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({ doorRejections: 3, codBlocked: true }) });

    await recordCODAttempt('+919999999999');

    const call = mockUpdate.mock.calls[0][0];
    expect(call.codBlocked).toBe(true);
    expect(call.doorRejections).toBe(4);
  });
});
