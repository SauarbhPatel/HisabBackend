# 💸 Hisaab — Complete API Reference

All protected routes require:
```
Authorization: Bearer <token>
```

Base URL (local): `http://localhost:5000`

---

## 🔐 AUTH  `/api/auth`

### Signup Flow (3 Steps)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/signup/step1` | `{name, phone?, email?}` | Step 1 — saves info, sends OTP to phone |
| POST | `/signup/verify-otp` | `{userId, otp}` | Step 2a — verify phone OTP |
| POST | `/signup/resend-otp` | `{userId}` | Resend OTP |
| POST | `/signup/set-password` | `{userId, password, confirmPassword}` | Step 2b — set password |
| POST | `/signup/complete-profile` | `{userId, avatar?, useCase}` | Step 3 — **returns JWT** 🎉 |

### Login

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/login/password` | `{identifier, password}` | Phone+Password or Email+Password |
| POST | `/login/otp/request` | `{phone}` | Phone+OTP: request OTP |
| POST | `/login/otp/verify` | `{userId, otp}` | Phone+OTP: verify → **returns JWT** |

### Password Recovery

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/forgot-password` | `{identifier}` | Send reset OTP (phone or email) |
| POST | `/reset-password` | `{userId, otp, newPassword, confirmPassword}` | Reset → **returns JWT** |

### Profile (🔒 Protected)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/me` | — | Get current user |
| PATCH | `/me` | `{name?, avatar?, useCase?}` | Update profile |

---

## 🏠 DASHBOARD  `/api/dashboard` (🔒)

| Method | Endpoint | Query | Description |
|--------|----------|-------|-------------|
| GET | `/` | — | All home screen stats in one call |

**Response includes** (based on user's `useCase`):
```json
{
  "dashboard": {
    "useCase": "both",
    "split": {
      "totalSpent": 8940,
      "owedToYou": 5440,
      "youOwe": 3200,
      "netBalance": 2240,
      "activeGroups": 4,
      "urgentFriend": { "name": "Sneha", "balance": 2990 }
    },
    "freelance": {
      "totalReceived": 34000,
      "totalPending": 10000,
      "devPayDue": 9000,
      "activeProjects": 3,
      "urgentProject": { "name": "School ERP", "pending": 10000 }
    },
    "recentExpenses": [...]
  }
}
```

---

## 💼 PROJECTS  `/api/projects` (🔒)

### Projects CRUD

| Method | Endpoint | Query / Body | Description |
|--------|----------|-------------|-------------|
| GET | `/` | `?year=2026&status=inprogress&client=Maksoft&search=ERP` | List all projects (grouped by month) |
| POST | `/` | `{name, type?, client, startDate, endDate?, totalPrice, developers?}` | Create project |
| GET | `/summary` | `?year=2026` | Income / profit summary stats |
| GET | `/:id` | — | Single project with all details |
| PATCH | `/:id` | `{name?, type?, client?, status?, ...}` | Update project |
| DELETE | `/:id` | — | Archive project (soft delete) |

**Status values:** `inactive` `inprogress` `onstay` `completed` `cancelled`

**Create project example:**
```json
POST /api/projects
{
  "name": "School ERP v2",
  "type": "Development",
  "client": "School ERP Client",
  "startDate": "2026-04-01",
  "totalPrice": 15000,
  "developers": [
    { "developer": "<devId>", "agreedAmount": 6000, "role": "Backend" }
  ]
}
```

### Client Payments

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/:id/client-payments` | `{label, amount, date, method?, reference?, note?, status?}` | Record client payment |
| PATCH | `/:id/client-payments/:paymentId` | any field | Update payment |
| DELETE | `/:id/client-payments/:paymentId` | — | Remove payment |

**Payment method values:** `upi` `cash` `bank` `cheque` `other`
**Payment status values:** `paid` `pending` `due`

**Example:**
```json
POST /api/projects/664abc.../client-payments
{
  "label": "Final Payment",
  "amount": 5000,
  "date": "2026-03-21",
  "method": "bank",
  "reference": "NEFT123456",
  "status": "paid"
}
```

### Developer Assignments on a Project

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/:id/developers` | `{developer, agreedAmount, role?}` | Add developer to project |
| PATCH | `/:id/developers/:devId/status` | `{status}` | Set dev status: `active` `paused` `removed` |
| POST | `/:id/developers/:devId/pay` | `{amount, date?, method?, note?}` | Record developer payment |

---

## 👨‍💻 DEVELOPERS  `/api/developers` (🔒)

| Method | Endpoint | Query / Body | Description |
|--------|----------|-------------|-------------|
| GET | `/` | `?role=Frontend&status=active&search=Zafran` | List team |
| POST | `/` | `{name, phone?, upiId?, role?, notes?}` | Add developer |
| GET | `/:id` | — | Developer + their projects |
| PATCH | `/:id` | `{name?, phone?, upiId?, role?, notes?, status?}` | Update developer |
| DELETE | `/:id` | — | Remove (blocked if on active project) |
| GET | `/:id/payment-history` | — | Full cross-project payment history |

**Example:**
```json
POST /api/developers
{
  "name": "Zafran",
  "phone": "9876500001",
  "upiId": "zafran@upi",
  "role": "Frontend Developer"
}
```

---

## 💸 EXPENSES  `/api/expenses` (🔒)

| Method | Endpoint | Query / Body | Description |
|--------|----------|-------------|-------------|
| GET | `/` | `?month=2026-03&category=food&splitType=solo` | Monthly expenses + category breakdown |
| POST | `/` | `{amount, category?, description?, date?, paidVia?, splitType?, note?}` | Add expense |
| GET | `/report/monthly` | `?months=6` | Last N months report |
| GET | `/category/:category` | `?month=2026-03` | All entries for one category |
| GET | `/:id` | — | Single expense |
| PATCH | `/:id` | any field | Update expense |
| DELETE | `/:id` | — | Delete expense |

**Category values:** `food` `travel` `bills` `entertainment` `shopping` `health` `education` `fashion` `rent` `medical` `gifts` `drinks` `fuel` `recharge` `trip` `other`

**paidVia values:** `upi` `cash` `card` `bank` `other`

**GET `/api/expenses?month=2026-03` response:**
```json
{
  "monthKey": "2026-03",
  "totalAmount": 8940,
  "byCategory": {
    "food":   { "total": 3200, "count": 8, "icon": "🍕" },
    "bills":  { "total": 2400, "count": 3, "icon": "⚡" },
    "travel": { "total": 1850, "count": 6, "icon": "🚌" }
  },
  "expenses": [...]
}
```

---

## 🤝 FRIENDS  `/api/friends` (🔒)

| Method | Endpoint | Query / Body | Description |
|--------|----------|-------------|-------------|
| GET | `/` | `?filter=owe\|owed\|settled` | List friends + balances |
| POST | `/` | `{friendName, friendPhone?, friendEmail?, nickName?, avatarColor?}` or `{friend: userId}` | Add friend |
| GET | `/:id` | — | Friend + full transaction history |
| DELETE | `/:id` | — | Remove (blocked if unsettled balance) |
| POST | `/:id/transactions` | `{direction, amount, note?, date?, method?}` | Record gave/received |
| DELETE | `/:id/transactions/:txId` | — | Delete a transaction |
| POST | `/:id/settle` | `{method?, note?}` | Settle full balance in one tap |

**direction values:** `gave` (you paid them) · `received` (they paid you)

**Example — Record that you gave money:**
```json
POST /api/friends/664abc.../transactions
{
  "direction": "gave",
  "amount": 350,
  "note": "Lunch split",
  "date": "2026-03-22",
  "method": "upi"
}
```

**GET `/api/friends` response:**
```json
{
  "stats": {
    "totalOwedToYou": 5440,
    "totalYouOwe": 3200,
    "netBalance": 2240
  },
  "friends": [
    {
      "friendName": "Priya Kapoor",
      "balance": -210,    // negative = you owe
      ...
    },
    {
      "friendName": "Neha Verma",
      "balance": 4300,    // positive = she owes you
      ...
    }
  ]
}
```

---

## 👥 GROUPS  `/api/groups` (🔒)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/` | — | List groups user belongs to + their balance |
| POST | `/` | `{name, icon?, type?, members?}` | Create group |
| GET | `/:id` | — | Full group with expenses + member balances |
| PATCH | `/:id` | `{name?, icon?, type?}` | Update group (admin only) |
| DELETE | `/:id` | — | Archive group (admin only) |
| POST | `/:id/members` | `{userId?, name?, phone?}` | Add member |
| POST | `/:id/expenses` | `{description, amount, paidBy?, date?, category?, splitType?, splits?, note?}` | Add group expense |
| POST | `/:id/settle/:memberId` | — | Settle a member's balance to ₹0 |

**type values:** `home` `trip` `work` `other`
**splitType values:** `equal` `percent` `custom`

**Create group example:**
```json
POST /api/groups
{
  "name": "Flat — Koramangala",
  "icon": "🏠",
  "type": "home",
  "members": [
    { "userId": "664user1..." },
    { "userId": "664user2..." },
    { "name": "Neha (no app)", "phone": "9876500003" }
  ]
}
```

**Add equal-split expense:**
```json
POST /api/groups/664grp.../expenses
{
  "description": "Electricity Bill",
  "amount": 1200,
  "paidBy": "664user1...",
  "date": "2026-03-18",
  "category": "bills",
  "splitType": "equal"
}
```

**Add custom-split expense:**
```json
POST /api/groups/664grp.../expenses
{
  "description": "Groceries",
  "amount": 1500,
  "splitType": "custom",
  "splits": [
    { "member": "664user1...", "share": 700 },
    { "member": "664user2...", "share": 500 },
    { "member": "664user3...", "share": 300 }
  ]
}
```

---

## 📊 COMPLETE FILE MAP

```
hisaab-backend/
├── server.js                          ← Entry point, all routes registered
├── .env / .env.example / .gitignore
├── package.json
├── README.md
└── src/
    ├── config/
    │   └── db.js                      ← MongoDB connection
    ├── models/
    │   ├── User.js                    ← Auth + profile
    │   ├── Project.js                 ← Projects + client payments + dev slots
    │   ├── Developer.js               ← Team members
    │   ├── Expense.js                 ← Personal expenses
    │   ├── Friend.js                  ← Bilateral balance + transactions
    │   └── Group.js                   ← Groups + shared expenses
    ├── controllers/
    │   ├── authController.js          ← All auth (signup/login/reset)
    │   ├── projectController.js       ← Projects CRUD + payments
    │   ├── developerController.js     ← Team management
    │   ├── expenseController.js       ← Personal expense tracker
    │   ├── friendController.js        ← Friend balances
    │   ├── groupController.js         ← Group splits
    │   └── dashboardController.js     ← Home screen stats
    ├── middleware/
    │   └── authMiddleware.js          ← JWT protect
    ├── routes/
    │   ├── authRoutes.js
    │   ├── projectRoutes.js
    │   ├── developerRoutes.js
    │   ├── expenseRoutes.js
    │   ├── friendRoutes.js
    │   ├── groupRoutes.js
    │   └── dashboardRoutes.js
    └── utils/
        ├── otp.js                     ← Mock OTP (console log)
        ├── jwt.js                     ← Sign + send token
        └── validators.js              ← Phone/email/password helpers
```

---

## 🚀 Deploy to Render

1. Push to GitHub
2. New Web Service → connect repo
3. Set environment variables:
   - `MONGO_URI` → MongoDB Atlas URI
   - `JWT_SECRET` → `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
   - `NODE_ENV` → `production`
   - `ALLOWED_ORIGINS` → your frontend URL (e.g. `https://hisaab.vercel.app`)
4. Start command: `npm start`
5. Health check URL: `/api/health`
