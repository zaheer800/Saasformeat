# 🥩 Meat Shop Delivery App — Developer Documentation

## Project Overview

A **multi-tenant hyperlocal meat shop ordering web app**. Each shop gets their own branded ordering page, a chat-style customer UI, and an admin dashboard — all deployed to the shop's own accounts. You (the developer) maintain the codebase and deploy per client.

---

## Documentation Index

| File | What it covers |
|---|---|
| `README.md` | This file — project overview & architecture |
| `01-architecture.md` | Folder structure, data models, API routes |
| `02-frontend.md` | React UI — customer chat flow, admin panel |
| `03-backend.md` | Node.js API — orders, menu, sessions, auth |
| `04-firebase.md` | Firestore schema, security rules, OTP auth |
| `05-payments-delivery-deployment-rules.md` | Razorpay, Google Maps, deployment checklist, business rules |
| `06-keys-and-deployment.md` | **All API keys, env vars, Firebase deploy, step-by-step client onboarding** |

---

## Tech Stack

```
Frontend     React 18 + Tailwind CSS         → Vercel (client's account)
Backend      Node.js 20 + Express 4          → Railway (client's account)
Database     Firebase Firestore              → Firebase (client's account)
Auth         Firebase Auth (Phone OTP)       → Firebase (client's account)
Payments     Razorpay                        → Razorpay (client's account)
Distance     Google Maps Distance Matrix     → Google Cloud (client's account)
Delivery     Rapido Business API             → Rapido (client's account)
```

---

## Key Principle

> **The shop owns everything.** Every third-party account (Firebase, Vercel, Razorpay, Google Maps) is created in the shop owner's name. You are a software vendor — you own only the codebase.

---

## Multi-Tenant Model

Same codebase, different config per shop. Each deployment gets its own `.env` file:

```
SHOP_NAME="New Famous Chicken & Mutton Shop"
SHOP_SLUG="newfamous"
SHOP_ADDRESS="Tarnaka, Hyderabad"
SHOP_LAT=17.4234
SHOP_LNG=78.5567
SHOP_PHONE="+919876543210"
FIREBASE_PROJECT_ID="newfamous-shop"
RAZORPAY_KEY_ID="rzp_live_xxxx"
RAZORPAY_KEY_SECRET="xxxx"
GOOGLE_MAPS_API_KEY="AIza..."
RAPIDO_API_KEY="xxxx"
```

---

## Phase 1 Scope (Build First)

- [ ] Customer chat UI — menu browsing, cart, address entry
- [ ] Distance-based delivery charge via Google Maps
- [ ] Cash on Delivery with ₹20 token advance
- [ ] Admin dashboard — view, accept, reject orders
- [ ] Stock toggle — per item on/off
- [ ] Own delivery boy mode (manual)
- [ ] Firebase OTP login for admin

**Not in Phase 1:** UPI payments, Rapido API, order tracking, SMS notifications

---

## Development Setup

```bash
# Clone your base repo
git clone https://github.com/yourname/meatapp-base.git
cd meatapp-base

# Install dependencies
cd frontend && npm install
cd ../backend && npm install

# Copy env template
cp .env.example .env
# Fill in your development Firebase/Razorpay keys

# Run locally
cd backend && npm run dev      # http://localhost:3001
cd frontend && npm run dev     # http://localhost:5173
```

---

## Folder Structure

```
meatapp-base/
├── frontend/                  # React app
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/          # Customer chat UI
│   │   │   ├── admin/         # Admin dashboard
│   │   │   └── shared/        # Buttons, modals, loaders
│   │   ├── pages/
│   │   │   ├── CustomerPage.jsx
│   │   │   ├── AdminPage.jsx
│   │   │   └── TrackingPage.jsx
│   │   ├── hooks/             # useCart, useOrders, useAuth
│   │   ├── lib/               # firebase.js, razorpay.js, api.js
│   │   └── config/            # shop.config.js (from env)
│   └── public/
├── backend/                   # Node.js API
│   ├── routes/
│   │   ├── orders.js
│   │   ├── menu.js
│   │   ├── delivery.js
│   │   └── auth.js
│   ├── middleware/
│   │   ├── auth.js            # Verify Firebase token
│   │   └── rateLimit.js
│   ├── services/
│   │   ├── firebase.js        # Admin SDK
│   │   ├── googlemaps.js      # Distance matrix
│   │   ├── rapido.js          # Delivery booking
│   │   └── razorpay.js        # Payment links
│   └── index.js
├── .env.example
└── README.md
```
