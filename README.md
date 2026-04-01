# 💸 Hisaab — Backend API

Node.js + Express + MongoDB REST API for the Hisaab app.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set MONGO_URI and JWT_SECRET

# 3. Run in development
npm run dev

# 4. Run in production
npm start
```

---

## 🔐 Auth Methods Supported

| Method           | How it works                          |
|------------------|---------------------------------------|
| Phone + OTP      | OTP sent to phone → verify → login    |
| Phone + Password | Register with phone, set password     |
| Email + Password | Register with email, set password     |

---

## 📋 API Endpoints

### Health Check
```
GET /api/health
```

---

### 🔵 SIGNUP FLOW (3 Steps)

#### Step 1 — Basic Info + Send OTP
```
POST /api/auth/signup/step1
Content-Type: application/json

{
  "name": "Rahul Kumar",
  "phone": "9876543210",     ← required if no email
  "email": "r@gmail.com"    ← optional
}

Response 200:
{
  "success": true,
  "message": "OTP sent to +919876543210. Valid for 10 minutes.",
  "userId": "664abc...",
  "nextStep": "verify-otp"
}
```

#### Step 2a — Verify Phone OTP
```
POST /api/auth/signup/verify-otp
{
  "userId": "664abc...",
  "otp": "482910"
}

Response 200:
{
  "success": true,
  "message": "Phone verified successfully!",
  "userId": "664abc...",
  "nextStep": "set-password"
}
```

#### Step 2a — Resend OTP
```
POST /api/auth/signup/resend-otp
{ "userId": "664abc..." }
```

#### Step 2b — Set Password
```
POST /api/auth/signup/set-password
{
  "userId": "664abc...",
  "password": "mypass123",
  "confirmPassword": "mypass123"
}

Response 200:
{
  "success": true,
  "message": "Password set successfully!",
  "userId": "664abc...",
  "nextStep": "complete-profile"
}
```

#### Step 3 — Complete Profile → returns JWT
```
POST /api/auth/signup/complete-profile
{
  "userId": "664abc...",
  "avatar": "😎",              ← optional (😎 🧑‍💻 👩‍💼 🧑‍🎨 👨‍🍳 🦸)
  "useCase": "both"           ← split | freelance | both
}

Response 201:
{
  "success": true,
  "message": "Account created successfully! Welcome to Hisaab 🎉",
  "token": "eyJhbGci...",
  "user": {
    "id": "664abc...",
    "name": "Rahul Kumar",
    "phone": "+919876543210",
    "email": "r@gmail.com",
    "avatar": "😎",
    "useCase": "both",
    "authMethods": {
      "phoneOtp": true,
      "phonePassword": true,
      "emailPassword": false
    },
    "isPhoneVerified": true,
    "isProfileComplete": true
  }
}
```

---

### 🔵 LOGIN

#### Phone or Email + Password
```
POST /api/auth/login/password
{
  "identifier": "9876543210",   ← phone or email
  "password": "mypass123"
}

Response 200:
{
  "success": true,
  "message": "Login successful! Welcome back 👋",
  "token": "eyJhbGci...",
  "user": { ... }
}
```

#### Phone + OTP Login (Step 1 — Request)
```
POST /api/auth/login/otp/request
{ "phone": "9876543210" }

Response 200:
{
  "success": true,
  "message": "Login OTP sent to +919876543210.",
  "userId": "664abc..."
}
```

#### Phone + OTP Login (Step 2 — Verify)
```
POST /api/auth/login/otp/verify
{
  "userId": "664abc...",
  "otp": "821043"
}

Response 200:
{
  "success": true,
  "token": "eyJhbGci...",
  "user": { ... }
}
```

---

### 🔵 FORGOT / RESET PASSWORD

#### Request Reset OTP
```
POST /api/auth/forgot-password
{ "identifier": "9876543210" }   ← phone or email
```

#### Reset with OTP
```
POST /api/auth/reset-password
{
  "userId": "664abc...",
  "otp": "381029",
  "newPassword": "newpass123",
  "confirmPassword": "newpass123"
}
```

---

### 🔵 PROFILE (Protected — requires Bearer token)

```
GET   /api/auth/me
Authorization: Bearer eyJhbGci...

PATCH /api/auth/me
Authorization: Bearer eyJhbGci...
{
  "name": "Rahul K",
  "avatar": "🧑‍💻",
  "useCase": "freelance"
}
```

---

## 🛡️ Security

- Passwords hashed with **bcryptjs** (12 salt rounds)
- **JWT** auth with configurable expiry (default 7d)
- OTP: 6-digit, expires in 10 min, max 5 attempts
- **Rate limiting**: 30 auth requests / 15 min per IP
- `password` field never returned in any response
- Forgot-password always returns 200 (prevents user enumeration)
- Phone normalized to `+91XXXXXXXXXX` format

---

## 🌐 Deploy to Render / Railway

1. Push code to GitHub
2. Create new Web Service → connect repo
3. Set environment variables:
   - `MONGO_URI` → MongoDB Atlas connection string
   - `JWT_SECRET` → strong random string (32+ chars)
   - `NODE_ENV` → `production`
   - `ALLOWED_ORIGINS` → your frontend URL
4. Start command: `npm start`

---

## 📁 Project Structure

```
hisaab-backend/
├── server.js                    # Entry point
├── .env                         # Environment variables (git-ignored)
├── .env.example                 # Template
└── src/
    ├── config/
    │   └── db.js                # MongoDB connection
    ├── controllers/
    │   └── authController.js    # All auth logic
    ├── middleware/
    │   └── authMiddleware.js    # JWT protect middleware
    ├── models/
    │   └── User.js              # Mongoose User schema
    ├── routes/
    │   └── authRoutes.js        # All /api/auth/* routes
    └── utils/
        ├── otp.js               # OTP generate + send (mock)
        ├── jwt.js               # Sign + send JWT
        └── validators.js        # Phone/email/password validation
```
