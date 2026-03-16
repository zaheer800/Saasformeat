/**
 * Tests for backend/services/shopConfig.js — isShopOpen()
 *
 * isShopOpen(manualOverride) logic:
 *   - false  → always closed regardless of time
 *   - true   → open only within working hours (07:00–20:00)
 */

// We manipulate Date to control the "current time" without requiring
// a date library. jest.setSystemTime works with jest's fake timers.

const { isShopOpen } = require('../../services/shopConfig');

function setTime(hh, mm) {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  jest.setSystemTime(d);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('isShopOpen', () => {
  test('returns false when manualOverride is false regardless of time', () => {
    setTime(10, 0); // well within hours
    expect(isShopOpen(false)).toBe(false);
  });

  test('returns true at opening time (07:00)', () => {
    setTime(7, 0);
    expect(isShopOpen(true)).toBe(true);
  });

  test('returns true during working hours (midday)', () => {
    setTime(13, 30);
    expect(isShopOpen(true)).toBe(true);
  });

  test('returns true at 19:59 (one minute before close)', () => {
    setTime(19, 59);
    expect(isShopOpen(true)).toBe(true);
  });

  test('returns false at closing time exactly (20:00)', () => {
    setTime(20, 0);
    expect(isShopOpen(true)).toBe(false);
  });

  test('returns false before opening time (06:59)', () => {
    setTime(6, 59);
    expect(isShopOpen(true)).toBe(false);
  });

  test('returns false after hours (22:00)', () => {
    setTime(22, 0);
    expect(isShopOpen(true)).toBe(false);
  });

  test('defaults manualOverride to true', () => {
    setTime(10, 0);
    expect(isShopOpen()).toBe(true);
  });
});
