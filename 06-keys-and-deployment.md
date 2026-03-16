# 06 — Keys & Deployment

Everything you need to go from code to a live shop — collecting keys, filling env files, deploying Firebase rules, and doing the final end-to-end test.

---

## Overview

Each client deployment needs keys from **4 services** the shop owner controls:

| Service | What it's used for | Who creates it |
|---|---|---|
| Firebase | Database, OTP login | Shop owner |
| Razorpay | Token payment links, refunds | Shop owner |
| Google Cloud | Distance Matrix API | Shop owner |
| Vercel + Railway | Hosting (frontend + backend) | Shop owner |

> You own only the code. Every account belongs to the shop.

---

## Step 1 — Collect from Client

Before touching any config, get these from the shop owner:

- [ ] Shop name (e.g. "New Famous Chicken & Mutton Shop")
- [ ] Shop address (full address string)
- [ ] Shop coordinates — latitude and longitude (use Google Maps to get these)
- [ ] Shop phone number (with country code, e.g. `+919876543210`)
- [ ] Admin phone number for OTP login (usually same as shop phone)
- [ ] URL-safe shop slug (e.g. `newfamous` — lowercase, no spaces)
- [ ] Menu items, prices per kg, and cut options
- [ ] Desired delivery zone radius (default: 6 km)
- [ ] Bank account + PAN/GST details (needed for Razorpay KYC)

---

## Step 2 — Firebase Setup

### 2a. Create Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it e.g. `newfamous-shop`
3. Disable Google Analytics (not needed)
4. Select region: **asia-south1 (Mumbai)**

### 2b. Enable Firestore

1. Build → Firestore Database → **Create database**
2. Choose **Production mode**
3. Location: **asia-south1**

### 2c. Enable Phone Auth

1. Build → Authentication → **Get started**
2. Sign-in providers → Phone → **Enable**
3. Add a test phone number for development (e.g. `+911234567890`, code `123456`)

### 2d. Get Frontend Firebase Config

1. Project Settings → General → Your apps → **Add app** → Web (`</>`)
2. Register app (no need for Firebase Hosting)
3. Copy the config object — you need these values:

```
apiKey             → VITE_FIREBASE_API_KEY
authDomain         → VITE_FIREBASE_AUTH_DOMAIN
projectId          → VITE_FIREBASE_PROJECT_ID
```

### 2e. Get Backend Service Account Key

1. Project Settings → **Service accounts** tab
2. Click **Generate new private key** → Download JSON
3. Open the JSON file and copy:

```
project_id         → FIREBASE_PROJECT_ID
client_email       → FIREBASE_CLIENT_EMAIL
private_key        → FIREBASE_PRIVATE_KEY  (the full "-----BEGIN..." string)
```

> Keep this JSON file secure — it has full admin access to Firestore.

---

## Step 3 — Razorpay Setup

### 3a. Create Account

1. Go to [razorpay.com](https://razorpay.com) → Sign up
2. Complete KYC with shop's PAN + bank account (takes 1–2 days)
3. Switch to **Live mode** only after KYC approval

### 3b. Get API Keys

1. Settings → API Keys → **Generate Key**
2. Copy both values:

```
Key ID      → RAZORPAY_KEY_ID     (starts with rzp_live_ or rzp_test_)
Key Secret  → RAZORPAY_KEY_SECRET
```

> Use `rzp_test_` keys during development. Switch to `rzp_live_` before going live.

### 3c. Set Up Webhook

1. Settings → Webhooks → **Add New Webhook**
2. Webhook URL: `https://<your-railway-url>/webhooks/razorpay`
   - You'll have this URL after Step 6 (Railway deploy)
   - Come back here and fill it in after Railway deployment
3. Events: check only **`payment_link.paid`**
4. Copy the **Webhook Secret**:

```
Webhook Secret  → RAZORPAY_WEBHOOK_SECRET
```

---

## Step 4 — Google Maps Setup

### 4a. Create Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or reuse existing)
3. Billing → Link a billing account (requires credit card — free tier covers small shops)

### 4b. Enable Distance Matrix API

1. APIs & Services → **Enable APIs and Services**
2. Search for **Distance Matrix API** → Enable

### 4c. Get API Key

1. APIs & Services → Credentials → **Create Credentials** → API key
2. Copy the key:

```
API Key  → GOOGLE_MAPS_API_KEY
```

### 4d. Restrict the Key (Recommended)

1. Click on the key → API restrictions → Restrict to **Distance Matrix API**
2. This prevents abuse if the key leaks

---

## Step 5 — Fill Environment Files

### Backend — `backend/.env`

Copy `backend/.env.example` to `backend/.env` and fill in every value:

```bash
# App
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://<shop-slug>.vercel.app

# Shop identity
SHOP_NAME="New Famous Chicken & Mutton Shop"
SHOP_SLUG="newfamous"
SHOP_PHONE="+919876543210"
SHOP_ADDRESS="Tarnaka, Hyderabad"
SHOP_LAT=17.4234
SHOP_LNG=78.5567
ADMIN_PHONE="+919876543210"

# Firebase — from service account JSON (Step 2e)
FIREBASE_PROJECT_ID=newfamous-shop
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@newfamous-shop.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n"

# Razorpay — from Step 3b + 3c
RAZORPAY_KEY_ID=rzp_live_xxxx
RAZORPAY_KEY_SECRET=xxxx
RAZORPAY_WEBHOOK_SECRET=xxxx

# Google Maps — from Step 4c
GOOGLE_MAPS_API_KEY=AIzaxxxx

# Rapido (Phase 2 — leave blank for now)
RAPIDO_API_KEY=
RAPIDO_MERCHANT_ID=
```

> **FIREBASE_PRIVATE_KEY:** The private key from the JSON contains literal `\n` newlines. Keep them as `\n` in the `.env` file — do not expand to real line breaks.

### Frontend — `frontend/.env`

Copy `frontend/.env.example` to `frontend/.env` and fill in:

```bash
VITE_SHOP_NAME="New Famous Chicken & Mutton Shop"
VITE_SHOP_SLUG="newfamous"
VITE_SHOP_PHONE="+919876543210"
VITE_SHOP_LAT=17.4234
VITE_SHOP_LNG=78.5567

# Backend URL — set to Railway URL after Step 6
VITE_API_URL=https://<shop-slug>-api.up.railway.app

# Firebase — from Step 2d
VITE_FIREBASE_API_KEY=AIzaxxxx
VITE_FIREBASE_AUTH_DOMAIN=newfamous-shop.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=newfamous-shop

# Razorpay public key — from Step 3b (Key ID only, never the secret)
VITE_RAZORPAY_KEY_ID=rzp_live_xxxx
```

---

## Step 6 — Deploy Firestore Rules & Indexes

Before deploying rules, replace the two placeholders in `firestore.rules`:

1. Open `firestore.rules`
2. Replace `SHOP_SLUG` with the actual slug (e.g. `newfamous`)
3. Replace `ADMIN_PHONE` with the admin phone number (e.g. `+919876543210`)

Then deploy:

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login with the client's Google account
firebase login

# Select the client's Firebase project
firebase use newfamous-shop

# Deploy rules and indexes
firebase deploy --only firestore:rules,firestore:indexes
```

Verify in the Firebase console:
- Firestore → Rules — should show the updated rules live
- Firestore → Indexes — composite indexes should be building (takes ~2 min)

---

## Step 7 — Seed the Menu

Run the seed script once to populate the initial menu in Firestore:

```bash
cd backend
node scripts/seedMenu.js
```

Edit `scripts/seedMenu.js` first to set the correct items, prices, and cut options for this shop before running.

---

## Step 8 — Deploy Backend to Railway

1. Go to [railway.app](https://railway.app) — log in with client's account
2. **New Project** → Deploy from GitHub repo
3. Select the repo → set **Root Directory** to `/backend`
4. Railway will detect Node.js automatically
5. Go to **Variables** tab → add every key from `backend/.env` (Step 5)
6. Deploy — Railway gives a URL like `https://newfamous-api.up.railway.app`
7. Copy this URL:
   - Update `FRONTEND_URL` in Railway variables if needed
   - Use it to complete the Razorpay webhook URL (Step 3c)
   - Set it as `VITE_API_URL` in the frontend `.env`

---

## Step 9 — Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) — log in with client's account
2. **Add New Project** → Import GitHub repo
3. Set **Root Directory** to `/frontend`
4. Framework: **Vite** (auto-detected)
5. Environment Variables → add every `VITE_` key from `frontend/.env` (Step 5)
6. Deploy — Vercel gives a URL like `https://newfamous.vercel.app`
7. Update `FRONTEND_URL` in Railway backend variables to this URL

### Custom Domain (Optional)

1. Vercel → Project → Settings → Domains → Add domain
2. Add `newfamous.com` (or whatever the shop's domain is)
3. Follow Vercel's DNS instructions (add CNAME record at the registrar)

---

## Step 10 — Register Razorpay Webhook

Now that Railway is deployed, go back to Razorpay (Step 3c) and fill in the webhook URL:

```
https://newfamous-api.up.railway.app/webhooks/razorpay
```

Test it:
1. Razorpay Dashboard → Webhooks → click the webhook → **Send Test Event**
2. Check Railway logs — you should see `POST /webhooks/razorpay 200`

---

## Step 11 — End-to-End Test Checklist

Run through the full order flow before handing over to the client:

**Customer flow:**
- [ ] Visit the shop URL → menu loads with correct items and prices
- [ ] Add item → select cut → select weight → add to cart
- [ ] Proceed to checkout → enter name, phone, address
- [ ] Location picker shows correct delivery charge
- [ ] Place COD order → token payment link appears
- [ ] Pay ₹20 token (use Razorpay test card `4111 1111 1111 1111`)
- [ ] Order confirmation screen appears with order ID

**Admin flow:**
- [ ] Visit `/admin` → OTP login with admin phone number
- [ ] New order appears in dashboard with correct details
- [ ] Accept order → status updates in real time
- [ ] Mark Preparing → mark Ready → assign delivery boy phone
- [ ] Mark Dispatched → mark Delivered
- [ ] Order disappears from active list

**Edge cases:**
- [ ] Try ordering when shop is closed → blocked with message
- [ ] Try ordering an out-of-stock item → blocked with message
- [ ] Try ordering below ₹150 → blocked with message
- [ ] Try address beyond 8 km → delivery unavailable message
- [ ] Cancel order within 2 minutes of acceptance → no fee charged
- [ ] Cancel order after Preparing → ₹50 fee applied

---

## Quick Reference — Keys Checklist

Use this as a tracker when onboarding a new client:

| Key | Source | Backend | Frontend |
|---|---|---|---|
| `FIREBASE_PROJECT_ID` | Firebase console | ✓ | ✓ (`VITE_`) |
| `FIREBASE_CLIENT_EMAIL` | Service account JSON | ✓ | — |
| `FIREBASE_PRIVATE_KEY` | Service account JSON | ✓ | — |
| `VITE_FIREBASE_API_KEY` | Firebase web config | — | ✓ |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase web config | — | ✓ |
| `RAZORPAY_KEY_ID` | Razorpay dashboard | ✓ | ✓ (`VITE_`) |
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard | ✓ | — |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook settings | ✓ | — |
| `GOOGLE_MAPS_API_KEY` | Google Cloud console | ✓ | — |

---

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `Firebase: Error (auth/invalid-api-key)` | Wrong `VITE_FIREBASE_API_KEY` | Re-copy from Firebase web config |
| `Firebase Admin: Error 7 PERMISSION_DENIED` | Wrong service account or rules not deployed | Re-download service account JSON, re-deploy rules |
| `Razorpay: BAD_REQUEST_ERROR` | Test key used with real payment | Switch to live keys after KYC |
| `Distance Matrix: REQUEST_DENIED` | Google Maps API key restricted or billing not set | Enable billing + check API restrictions |
| `Webhook signature mismatch` | Wrong `RAZORPAY_WEBHOOK_SECRET` | Re-copy from Razorpay → Webhooks settings |
| `FIREBASE_PRIVATE_KEY invalid` | Newlines broken in env | Ensure `\n` not actual newlines in .env |
