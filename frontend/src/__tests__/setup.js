import '@testing-library/jest-dom';

// Prevent Firebase from initializing during tests.
vi.mock('../lib/firebase', () => ({
  db: {},
  auth: {},
}));

// Provide shop config defaults for tests.
vi.mock('../config/shop', () => ({
  shopConfig: {
    name: 'Test Shop',
    slug: 'test-shop',
    phone: '+919000000000',
    lat: 17.385,
    lng: 78.4867,
  },
}));
