# CLAUDE.md — Meat Shop Delivery App

> Claude Code reads this file automatically at the start of every session.

---

## What This Project Is

A **hyperlocal meat shop ordering web app**. Customers order via a chat-style UI in their phone browser. Shop owner manages orders from an admin dashboard. You are building this for local meat/grocery shops in Hyderabad.

**Key principle:** The shop owns all accounts (Firebase, Vercel, Razorpay). You own only the code.

---

## Read These Docs First

Before writing any code, read the relevant doc:

| Task | Read |
|---|---|
| Understanding the project | `README.md` |
| Data models, API routes | `01-architecture.md` |
| React UI, chat flow, admin | `02-frontend.md` |
| Node.js backend, Express routes | `03-backend.md` |
| Firebase schema, security rules | `04-firebase.md` |
| Payments, delivery, deployment, business rules | `05-payments-delivery-deployment-rules.md` |
| API keys, env vars, deploying for a client | `06-keys-and-deployment.md` |

---

## Current Phase: PHASE 1

**Build only these features:**
- ✅ Customer chat UI — menu, cart, cut selection, address
- ✅ Distance-based delivery charge (Google Maps)
- ✅ COD with ₹20 token advance (Razorpay payment link)
- ✅ Admin dashboard — view, accept, reject orders
- ✅ Stock toggle per menu item
- ✅ Own delivery boy mode (manual, no API)
- ✅ Firebase OTP login for admin

**Do NOT build yet:**
- ❌ UPI full payment
- ❌ Rapido / Uber API integration
- ❌ Order tracking page
- ❌ SMS notifications
- ❌ PWA / home screen install
- ❌ Broadcast messages

---

## Stack

```
Frontend    React 18 + Vite + Tailwind CSS → Vercel
Backend     Node.js 20 + Express 4         → Railway
Database    Firebase Firestore              → Firebase
Auth        Firebase Phone OTP             → Firebase
Payments    Razorpay (token only, Phase 1) → Razorpay
Distance    Google Maps Distance Matrix    → Google Cloud
```

---

## Critical Business Rules

1. **COD only with own delivery boy** — never with Rapido/Uber
2. **COD blocked beyond 5 km** from shop
3. **₹20 token advance required** for all COD orders
4. **2-minute free cancel window** after shop accepts
5. **₹50 cancellation fee** if cancelled after prep starts
6. **COD blocked permanently** for customers who reject at door twice
7. **Shop gets a strike** every time they cancel an order
8. **Minimum order ₹150** — reject orders below this

## Stock Rules

9. **Stock is tracked in grams** — never units or kg strings
10. **reserveStock() on order PLACED** — lock stock immediately, before payment
11. **releaseReservedStock() on CANCELLED** — always return stock, no exceptions
12. **finaliseStock() on DELIVERED** — permanently deduct from soldGrams
13. **Validate stock before creating order** — reject if availableGrams < requested weight
14. **Auto-toggle item off** when availableGrams hits zero
15. **Never let availableGrams go negative** — use Firestore transactions for concurrent orders
16. **Restock resets reservedGrams and soldGrams to 0** — fresh slate every morning

---

## Order States

```
PENDING → ACCEPTED → PREPARING → READY → DISPATCHED → DELIVERED
                ↓           ↓
           CANCELLED   CANCELLED (with ₹50 fee)
```

---

## Folder Structure

```
/
├── CLAUDE.md              ← You are here
├── docs/                  ← Full documentation
├── frontend/              ← React app (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   ├── admin/
│   │   │   └── shared/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── config/
│   └── .env
└── backend/               ← Node.js API (Express)
    ├── routes/
    ├── middleware/
    ├── services/
    ├── scripts/
    └── .env
```

---

## Code Style

- **No TypeScript** — plain JavaScript for simplicity
- **No form tags** — use button onClick handlers
- **Async/await** — never .then() chains
- **Always handle errors** — every async call in try/catch
- **Mobile-first** — all UI designed for 360px minimum width
- **Consistent error shape** — `{ error: 'message', code: 'CODE' }`
- **No console.log in production** — use console.error for real errors only

---

## Environment Setup

```bash
# Install dependencies
cd frontend && npm install
cd ../backend && npm install

# Copy env files (fill in your values)
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env

# Run dev servers
cd backend && npm run dev     # localhost:3001
cd frontend && npm run dev    # localhost:5173

# Seed menu for a new shop
cd backend && node scripts/seedMenu.js
```

---

## Common Claude Code Tasks

### Build a new component
```
Build the [ComponentName] component. Read docs/02-frontend.md first.
Place it in frontend/src/components/[chat|admin|shared]/
```

### Add an API route
```
Add the [route name] endpoint. Read docs/03-backend.md and 
docs/01-architecture.md first. Follow the existing pattern in routes/.
```

### Deploy for a new client
```
Help me deploy for a new client. Their details:
- Shop name: [name]
- Location: [address, lat, lng]
- Menu: [items]
- Admin phone: [number]
Follow the checklist in docs/05-payments-delivery-deployment-rules.md
```

### Debug an issue
```
[Describe issue]. 
Relevant files: [list files].
Check docs/[relevant doc] for expected behaviour.
```
