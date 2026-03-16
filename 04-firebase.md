# 04 — Firebase

## Setup

Each shop gets their own Firebase project. This keeps data isolated and the shop owns their project.

### Create Project (do this for each client)

1. Go to https://console.firebase.google.com
2. Create project: `shopname-shop` (e.g. `newfamous-shop`)
3. Enable **Firestore** (Native mode, `asia-south1` region for India)
4. Enable **Authentication** → Phone provider
5. Generate **Service Account** key (for backend Admin SDK)
6. Copy **Web App config** (for frontend SDK)

---

## Firestore Collections

```
/orders/{orderId}           Order documents
/menu/{menuItemId}          Menu items
/shopConfig/{shopId}        Shop settings (single doc)
/customers/{phone}          Customer profiles + COD history
/shopStrikes/{date}         Daily strike counter for shop cancellations
```

---

## Security Rules

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Orders — customers can create, read own orders only
    // Admins can read/write all orders for their shop
    match /orders/{orderId} {
      allow create: if
        request.resource.data.shopId == 'newfamous' &&
        isValidOrder(request.resource.data);

      allow read: if
        // Customer reads their own order by orderId (shared via link)
        true;  // orderId is a secret — knowing it proves ownership

      allow update: if
        // Only backend (Admin SDK) updates orders
        // Frontend never updates orders directly
        false;
    }

    // Menu — public read, admin write
    match /menu/{itemId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // Shop config — public read, admin write
    match /shopConfig/{shopId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // Customers — only backend writes, no direct client access
    match /customers/{phone} {
      allow read, write: if false;  // Admin SDK only
    }

    function isAdmin() {
      return request.auth != null &&
             request.auth.token.phone_number == '+919876543210';
             // Replace with actual admin phone from env
    }

    function isValidOrder(data) {
      return data.keys().hasAll(['customer', 'items', 'payment', 'status']) &&
             data.items.size() > 0 &&
             data.status == 'PENDING';
    }
  }
}
```

---

## Firebase Admin SDK (Backend)

```javascript
// services/firebase.js
const admin = require('firebase-admin');

const app = admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })
});

const db = admin.firestore();
const adminAuth = admin.auth();

module.exports = { db, adminAuth };
```

---

## Firebase Client SDK (Frontend)

```javascript
// src/lib/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
```

---

## Phone OTP Auth (Admin Login)

```javascript
// Admin login flow in React
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { auth } from '../lib/firebase';

// Step 1 — Send OTP
async function sendOTP(phoneNumber) {
  window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible',
  });

  const confirmation = await signInWithPhoneNumber(
    auth,
    phoneNumber,        // e.g. "+919876543210"
    window.recaptchaVerifier
  );

  return confirmation;  // Store this
}

// Step 2 — Verify OTP
async function verifyOTP(confirmationResult, otp) {
  const result = await confirmationResult.confirm(otp);
  const token = await result.user.getIdToken();
  // Store token, send to backend on every admin API call
  return token;
}

// Step 3 — Auto-refresh token
auth.onIdTokenChanged(async (user) => {
  if (user) {
    const token = await user.getIdToken();
    // Store in memory / zustand — never in localStorage
    useAuthStore.setState({ token, user });
  }
});
```

---

## Real-time Order Listener

```javascript
// Admin dashboard — listen for new orders in real time
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';

function listenToTodaysOrders(shopId, callback) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return onSnapshot(
    query(
      collection(db, 'orders'),
      where('shopId', '==', shopId),
      where('timestamps.createdAt', '>=', today),
      orderBy('timestamps.createdAt', 'desc')
    ),
    (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(orders);
    }
  );
  // Returns unsubscribe function — call on component unmount
}
```

---

## Seed Initial Menu Data

Run this once per new shop to populate the menu:

```javascript
// scripts/seedMenu.js
const admin = require('firebase-admin');
// ... init admin SDK ...

const menuItems = [
  {
    shopId: 'newfamous',
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
    // Stock fields — owner sets these every morning
    stockGrams: 0,               // Set to 0 until owner does first restock
    reservedGrams: 0,
    soldGrams: 0,
    lowStockAlertGrams: 2000,    // Alert at 2 kg remaining
    isAvailable: false,          // Off until restocked
    lastRestockedAt: null,
    sortOrder: 1,
  },
  {
    shopId: 'newfamous',
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
    shopId: 'newfamous',
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
    shopId: 'newfamous',
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
];

async function seed() {
  for (const item of menuItems) {
    await db.collection('menu').add(item);
    console.log(`Added: ${item.name}`);
  }
  console.log('Done. Owner must run morning restock before going live.');
}

seed();
```

---

## Indexes Required

Add these composite indexes in Firebase Console → Firestore → Indexes:

```
Collection: orders
Fields: shopId ASC, timestamps.createdAt DESC
Purpose: Admin dashboard — today's orders query

Collection: orders
Fields: shopId ASC, status ASC, timestamps.createdAt DESC
Purpose: Filter orders by status
```
