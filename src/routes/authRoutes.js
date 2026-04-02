const express = require("express");
const router  = express.Router();

const {
  signupStep1, verifyOTP, resendOTP, setPassword, completeProfile,
  loginWithPassword, loginOtpRequest, loginOtpVerify,
  forgotPassword, resetPassword, getMe, updateMe,
} = require("../controllers/authController");

const { protect } = require("../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication APIs
 */

/**
 * @swagger
 * /api/auth/signup/step1:
 *   post:
 *     summary: Step 1 — Signup (Name, Phone, Email)
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
 *               phone: { type: string, example: "+919876543210" }
 *               email: { type: string, example: rahul@gmail.com }
 *     responses:
 *       200:
 *         description: OTP sent successfully
 */
router.post("/signup/step1",          signupStep1);

/**
 * @swagger
 * /api/auth/signup/verify-otp:
 *   post:
 *     summary: Verify OTP (Signup)
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
 *               otp:    { type: string, example: "123456" }
 *     responses:
 *       200:
 *         description: OTP verified
 */
router.post("/signup/verify-otp",     verifyOTP);

/**
 * @swagger
 * /api/auth/signup/resend-otp:
 *   post:
 *     summary: Resend OTP
 *     tags: [Auth]
 */
router.post("/signup/resend-otp",     resendOTP);

/**
 * @swagger
 * /api/auth/signup/set-password:
 *   post:
 *     summary: Set Password after OTP verification
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
 *     responses:
 *       200:
 *         description: Password set successfully
 */
router.post("/signup/set-password",   setPassword);

/**
 * @swagger
 * /api/auth/signup/complete-profile:
 *   post:
 *     summary: Complete Profile (returns JWT)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, useCase]
 *             properties:
 *               userId:  { type: string }
 *               avatar:  { type: string, example: "😎" }
 *               useCase: { type: string, enum: [split, freelance, both] }
 *     responses:
 *       200:
 *         description: Profile completed and JWT returned
 */
router.post("/signup/complete-profile", completeProfile);

/**
 * @swagger
 * /api/auth/login/password:
 *   post:
 *     summary: Login with Email/Phone + Password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password]
 *             properties:
 *               identifier: { type: string, example: "rahul@gmail.com" }
 *               password:   { type: string }
 *     responses:
 *       200:
 *         description: Login successful (returns JWT)
 */
router.post("/login/password",        loginWithPassword);

/**
 * @swagger
 * /api/auth/login/otp/request:
 *   post:
 *     summary: Request OTP for login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string, example: "+919876543210" }
 *     responses:
 *       200:
 *         description: OTP sent
 */
router.post("/login/otp/request",     loginOtpRequest);

/**
 * @swagger
 * /api/auth/login/otp/verify:
 *   post:
 *     summary: Verify OTP and login (returns JWT)
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
 *               otp:    { type: string, example: "123456" }
 *     responses:
 *       200:
 *         description: OTP verified and JWT returned
 */
router.post("/login/otp/verify",      loginOtpVerify);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Forgot password (send OTP)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier]
 *             properties:
 *               identifier: { type: string, example: "rahul@gmail.com" }
 *     responses:
 *       200:
 *         description: OTP sent for password reset
 */
router.post("/forgot-password",       forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password using OTP
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
 *     responses:
 *       200:
 *         description: Password reset successful (returns JWT)
 */
router.post("/reset-password",        resetPassword);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user data
 */
router.get("/me",  protect, getMe);

/**
 * @swagger
 * /api/auth/me:
 *   patch:
 *     summary: Update current user
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:    { type: string }
 *               avatar:  { type: string }
 *               useCase: { type: string, enum: [split, freelance, both] }
 *     responses:
 *       200:
 *         description: User updated successfully
 */
router.patch("/me", protect, updateMe);

module.exports = router;
