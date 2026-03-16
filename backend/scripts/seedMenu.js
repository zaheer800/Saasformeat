require('dotenv').config({ path: '../.env' });
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();
const SHOP_SLUG = process.env.SHOP_SLUG;

const menuItems = [
  {
    shopId: SHOP_SLUG,
    name: 'Broiler Chicken',
    category: 'chicken',
    cuts: [
      { id: 'whole', label: 'Whole', priceModifier: 0 },
      { id: 'curry_cut', label: 'Curry Cut', priceModifier: 0 },
      { id: 'boneless', label: 'Boneless', priceModifier: 80 },
      { id: 'keema', label: 'Keema', priceModifier: 40 },
    ],
    pricePerKg: 220,
    minWeightGrams: 500,
    weightStepsGrams: 250,
    stockGrams: 0,
    reservedGrams: 0,
    soldGrams: 0,
    lowStockAlertGrams: 2000,
    isAvailable: false,
    lastRestockedAt: null,
    sortOrder: 1,
  },
  {
    shopId: SHOP_SLUG,
    name: 'Country Chicken',
    category: 'chicken',
    cuts: [
      { id: 'whole', label: 'Whole', priceModifier: 0 },
      { id: 'curry_cut', label: 'Curry Cut', priceModifier: 0 },
    ],
    pricePerKg: 380,
    minWeightGrams: 500,
    weightStepsGrams: 500,
    stockGrams: 0,
    reservedGrams: 0,
    soldGrams: 0,
    lowStockAlertGrams: 1000,
    isAvailable: false,
    lastRestockedAt: null,
    sortOrder: 2,
  },
  {
    shopId: SHOP_SLUG,
    name: 'Mutton',
    category: 'mutton',
    cuts: [
      { id: 'curry_cut', label: 'Curry Cut', priceModifier: 0 },
      { id: 'keema', label: 'Keema', priceModifier: -40 },
      { id: 'liver', label: 'Liver', priceModifier: -300 },
    ],
    pricePerKg: 720,
    minWeightGrams: 500,
    weightStepsGrams: 250,
    stockGrams: 0,
    reservedGrams: 0,
    soldGrams: 0,
    lowStockAlertGrams: 2000,
    isAvailable: false,
    lastRestockedAt: null,
    sortOrder: 3,
  },
  {
    shopId: SHOP_SLUG,
    name: 'Rohu Fish',
    category: 'fish',
    cuts: [
      { id: 'whole', label: 'Whole', priceModifier: 0 },
      { id: 'cleaned', label: 'Cleaned & Cut', priceModifier: 20 },
    ],
    pricePerKg: 280,
    minWeightGrams: 500,
    weightStepsGrams: 250,
    stockGrams: 0,
    reservedGrams: 0,
    soldGrams: 0,
    lowStockAlertGrams: 1000,
    isAvailable: false,
    lastRestockedAt: null,
    sortOrder: 4,
  },
  {
    shopId: SHOP_SLUG,
    name: 'Eggs',
    category: 'eggs',
    cuts: [
      { id: 'tray', label: 'Per Tray (30)', priceModifier: 0 },
      { id: 'dozen', label: 'Per Dozen', priceModifier: 0 },
    ],
    pricePerKg: 60,
    minWeightGrams: 600,
    weightStepsGrams: 600,
    stockGrams: 0,
    reservedGrams: 0,
    soldGrams: 0,
    lowStockAlertGrams: 1800,
    isAvailable: false,
    lastRestockedAt: null,
    sortOrder: 5,
  },
];

async function seed() {
  console.log(`Seeding menu for shop: ${SHOP_SLUG}`);
  for (const item of menuItems) {
    const ref = await db.collection('menu').add(item);
    console.log(`Added: ${item.name} (${ref.id})`);
  }
  console.log('\nDone. Owner must run morning restock before going live.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
