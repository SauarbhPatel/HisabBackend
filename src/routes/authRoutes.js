const express = require("express");
const router = express.Router();

const {
    // Signup flow
    signupStep1,
    verifyOTP,
    resendOTP,
    setPassword,
    completeProfile,
    // Login methods
    loginWithPassword,
    loginOtpRequest,
    loginOtpVerify,
    // Password recovery
    forgotPassword,
    resetPassword,
    // Profile
    getMe,
    updateMe,
} = require("../controllers/authController");

const { protect } = require("../middleware/authMiddleware");

// ─────────────────────────────────────────────────────────────
//  SIGNUP  (3 steps)
// ─────────────────────────────────────────────────────────────
// Step 1 — Name + Phone + Email → sends OTP

router.post("/signup/step1", signupStep1);

// Step 2a — Verify phone OTP
router.post("/signup/verify-otp", verifyOTP);
router.post("/signup/resend-otp", resendOTP);

// Step 2b — Set password (after OTP verified)
router.post("/signup/set-password", setPassword);

// Step 3 — Avatar + UseCase → returns JWT  🎉
router.post("/signup/complete-profile", completeProfile);

// ─────────────────────────────────────────────────────────────
//  LOGIN METHODS
// ─────────────────────────────────────────────────────────────
// Method 1 & 2 — Phone+Password  OR  Email+Password
router.post("/login/password", loginWithPassword);

// Method 3 — Phone + OTP (2 steps)
router.post("/login/otp/request", loginOtpRequest);
router.post("/login/otp/verify", loginOtpVerify);

// ─────────────────────────────────────────────────────────────
//  FORGOT / RESET PASSWORD
// ─────────────────────────────────────────────────────────────
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// ─────────────────────────────────────────────────────────────
//  PROTECTED — require JWT
// ─────────────────────────────────────────────────────────────
router.get("/me", protect, getMe);
router.patch("/me", protect, updateMe);

module.exports = router;
