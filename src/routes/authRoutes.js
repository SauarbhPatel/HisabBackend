const express = require("express");
const router = express.Router();

const {
    // Signup
    signupStep1,
    verifyOTP,
    resendOTP,
    setPassword,
    completeProfile,
    // Login
    loginWithPassword,
    loginOtpRequest,
    loginOtpVerify,
    // Forgot / reset
    forgotPassword,
    resetPassword,
    // Profile
    getMe,
    updateMe,
    // NEW: Session management
    logout,
    refreshToken,
    // NEW: Account actions
    changePassword,
    deleteAccount,
    // NEW: Phone update
    updatePhoneRequest,
    updatePhoneVerify,
} = require("../controllers/authController");

const { protect } = require("../middleware/authMiddleware");

// ════════════════════════════════════════════════════════════════
//  SIGNUP FLOW
// ════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/auth/signup/step1:
 *   post:
 *     summary: Step 1 — Name, Phone, Email + send OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:  { type: string, example: Rahul Kumar }
 *               phone: { type: string, example: "9876543210" }
 *               email: { type: string, example: rahul@gmail.com }
 */
router.post("/signup/step1", signupStep1);

/**
 * @swagger
 * /api/auth/signup/verify-otp:
 *   post:
 *     summary: Step 2a — Verify phone OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, otp]
 *             properties:
 *               userId: { type: string }
 *               otp:    { type: string, example: "482910" }
 */
router.post("/signup/verify-otp", verifyOTP);

/**
 * @swagger
 * /api/auth/signup/resend-otp:
 *   post:
 *     summary: Resend signup OTP
 *     tags: [Auth]
 */
router.post("/signup/resend-otp", resendOTP);

/**
 * @swagger
 * /api/auth/signup/set-password:
 *   post:
 *     summary: Step 2b — Set password after OTP verified
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, password, confirmPassword]
 *             properties:
 *               userId:          { type: string }
 *               password:        { type: string }
 *               confirmPassword: { type: string }
 */
router.post("/signup/set-password", setPassword);

/**
 * @swagger
 * /api/auth/signup/complete-profile:
 *   post:
 *     summary: Step 3 — Avatar, useCase → returns accessToken + refreshToken
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, useCase]
 *             properties:
 *               userId:      { type: string }
 *               avatar:      { type: string, example: "😎" }
 *               avatarColor: { type: string, example: "#1a7a5e" }
 *               useCase:     { type: string, enum: [split, freelance, both] }
 */
router.post("/signup/complete-profile", completeProfile);

// ════════════════════════════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/auth/login/password:
 *   post:
 *     summary: Login with phone or email + password → returns accessToken + refreshToken
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password]
 *             properties:
 *               identifier: { type: string, example: "9876543210 or rahul@gmail.com" }
 *               password:   { type: string }
 */
router.post("/login/password", loginWithPassword);

/**
 * @swagger
 * /api/auth/login/otp/request:
 *   post:
 *     summary: Request OTP for phone login
 *     tags: [Auth]
 */
router.post("/login/otp/request", loginOtpRequest);

/**
 * @swagger
 * /api/auth/login/otp/verify:
 *   post:
 *     summary: Verify OTP → returns accessToken + refreshToken
 *     tags: [Auth]
 */
router.post("/login/otp/verify", loginOtpVerify);

// ════════════════════════════════════════════════════════════════
//  FORGOT / RESET PASSWORD
// ════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Send reset OTP to phone or email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier]
 *             properties:
 *               identifier: { type: string, example: "9876543210" }
 */
router.post("/forgot-password", forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password via OTP → returns accessToken + refreshToken
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, otp, newPassword, confirmPassword]
 *             properties:
 *               userId:          { type: string }
 *               otp:             { type: string }
 *               newPassword:     { type: string }
 *               confirmPassword: { type: string }
 */
router.post("/reset-password", resetPassword);

// ════════════════════════════════════════════════════════════════
//  SESSION MANAGEMENT
// ════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Get new accessToken using refreshToken (no login needed)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, refreshToken]
 *             properties:
 *               userId:       { type: string }
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Returns new accessToken
 */
router.post("/refresh", refreshToken);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout — invalidates all tokens for this user
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deviceToken: { type: string, description: "FCM token to remove (optional)" }
 */
router.post("/logout", protect, logout);

// ════════════════════════════════════════════════════════════════
//  PROFILE
// ════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 */
router.get("/me", protect, getMe);

/**
 * @swagger
 * /api/auth/me:
 *   patch:
 *     summary: Update name, avatar, avatarColor, useCase
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:        { type: string }
 *               avatar:      { type: string }
 *               avatarColor: { type: string }
 *               useCase:     { type: string, enum: [split, freelance, both] }
 */
router.patch("/me", protect, updateMe);

/**
 * @swagger
 * /api/auth/me:
 *   delete:
 *     summary: Delete account (soft delete — required for App Store / Play Store)
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password: { type: string, description: "Confirm with password if account has one" }
 */
router.delete("/me", protect, deleteAccount);

// ════════════════════════════════════════════════════════════════
//  CHANGE PASSWORD (logged in user)
// ════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change password while logged in (requires current password)
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword, confirmPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:     { type: string }
 *               confirmPassword: { type: string }
 */
router.post("/change-password", protect, changePassword);

// ════════════════════════════════════════════════════════════════
//  PHONE NUMBER UPDATE (re-verification required)
// ════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/auth/update-phone/request:
 *   post:
 *     summary: Step 1 — Send OTP to the new phone number
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPhone]
 *             properties:
 *               newPhone: { type: string, example: "9876500099" }
 */
router.post("/update-phone/request", protect, updatePhoneRequest);

/**
 * @swagger
 * /api/auth/update-phone/verify:
 *   post:
 *     summary: Step 2 — Verify OTP and update phone → returns new tokens
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp: { type: string, example: "382910" }
 */
router.post("/update-phone/verify", protect, updatePhoneVerify);

module.exports = router;
