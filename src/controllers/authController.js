const User = require('../models/User');
const { generateOTP, sendOTP, buildOTPPayload } = require('../utils/otp');
const { sendTokenResponse } = require('../utils/jwt');
const { isValidPhone, isValidEmail, isValidPassword, detectIdentifierType } = require('../utils/validators');

// ═══════════════════════════════════════════════════════════════
//  SIGNUP FLOW  (3 steps, same for all auth methods)
// ═══════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────
// STEP 1 — Basic Info
// POST /api/auth/signup/step1
// Body: { name, phone?, email? }
// Sends OTP to phone (if phone provided)
// ───────────────────────────────────────────────────────────────
exports.signupStep1 = async (req, res, next) => {
  try {
    const { name, phone, email } = req.body;

    // ── Validate ──
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Name must be at least 2 characters.' });
    }
    if (!phone && !email) {
      return res.status(400).json({ success: false, message: 'At least phone or email is required.' });
    }
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number. Use 10-digit Indian number.' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

    // ── Check duplicates ──
    if (phone) {
      const normalizedPhone = phone.replace(/\s+/g, '').replace(/^(?!\+)91/, '+91').replace(/^(?!\+91)/, '+91');
      const existingPhone = await User.findOne({ phone: normalizedPhone });
      if (existingPhone && existingPhone.isPhoneVerified) {
        return res.status(409).json({ success: false, message: 'Phone number already registered. Please login.' });
      }
    }
    if (email) {
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail && existingEmail.isEmailVerified) {
        return res.status(409).json({ success: false, message: 'Email already registered. Please login.' });
      }
    }

    // ── Generate OTP if phone provided ──
    let otp = null;
    let otpPayload = null;
    if (phone) {
      otp = generateOTP();
      otpPayload = buildOTPPayload(otp, 'signup');
    }

    // ── Upsert user (handle re-attempts) ──
    const query = phone
      ? { phone: { $regex: phone.replace(/\s+/g, '').replace(/^91/, '') } }
      : { email: email.toLowerCase() };

    let user = await User.findOne(query);

    if (user) {
      // Update existing unverified user
      user.name  = name.trim();
      if (email) user.email = email.toLowerCase();
      if (phone) user.phone = phone;
      if (otpPayload) user.otp = otpPayload;
      user.password = user.password || '__TEMP__PLACEHOLDER';
    } else {
      // Create fresh user
      user = new User({
        name:     name.trim(),
        phone:    phone  || undefined,
        email:    email  || undefined,
        password: '__TEMP__PLACEHOLDER',  // replaced in step 2
        otp:      otpPayload || undefined,
      });
    }

    await user.save();

    // ── Send OTP ──
    if (phone && otp) {
      await sendOTP(phone, otp, 'signup');
    }

    res.status(200).json({
      success: true,
      message: phone
        ? `OTP sent to ${phone}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.`
        : 'Basic info saved. Proceed to set your password.',
      userId:   user._id,
      nextStep: phone ? 'verify-otp' : 'set-password',
    });
  } catch (err) {
    next(err);
  }
};

// ───────────────────────────────────────────────────────────────
// STEP 2a — Verify OTP  (phone users only)
// POST /api/auth/signup/verify-otp
// Body: { userId, otp }
// ───────────────────────────────────────────────────────────────
exports.verifyOTP = async (req, res, next) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ success: false, message: 'userId and otp are required.' });
    }

    const user = await User.findById(userId).select('+otp.code +otp.expiresAt +otp.attempts +otp.purpose');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (user.isPhoneVerified && user.otp?.purpose === 'signup') {
      return res.status(400).json({ success: false, message: 'Phone already verified. Proceed to set password.' });
    }

    // ── Attempt limit ──
    const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS) || 5;
    if ((user.otp?.attempts || 0) >= maxAttempts) {
      return res.status(429).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new OTP.',
        code: 'OTP_MAX_ATTEMPTS',
      });
    }

    // ── Expiry ──
    if (!user.otp?.expiresAt || new Date() > user.otp.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
        code: 'OTP_EXPIRED',
      });
    }

    // ── Match ──
    if (user.otp.code !== otp.trim()) {
      user.otp.attempts += 1;
      await user.save();
      const remaining = maxAttempts - user.otp.attempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect OTP. ${remaining} attempt(s) remaining.`,
        code: 'OTP_INCORRECT',
        attemptsRemaining: remaining,
      });
    }

    // ── ✅ Valid OTP ──
    user.isPhoneVerified = true;
    user.otp             = undefined;
    await user.save();

    res.status(200).json({
      success:  true,
      message:  'Phone verified successfully!',
      userId:   user._id,
      nextStep: 'set-password',
    });
  } catch (err) {
    next(err);
  }
};

// ───────────────────────────────────────────────────────────────
// STEP 2b — Resend OTP
// POST /api/auth/signup/resend-otp
// Body: { userId }
// ───────────────────────────────────────────────────────────────
exports.resendOTP = async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required.' });

    const user = await User.findById(userId);
    if (!user)              return res.status(404).json({ success: false, message: 'User not found.' });
    if (!user.phone)        return res.status(400).json({ success: false, message: 'No phone number on this account.' });
    if (user.isPhoneVerified) return res.status(400).json({ success: false, message: 'Phone already verified.' });

    const otp = generateOTP();
    user.otp  = buildOTPPayload(otp, 'signup');
    await user.save();
    await sendOTP(user.phone, otp, 'signup');

    res.status(200).json({
      success: true,
      message: `New OTP sent to ${user.phone}.`,
    });
  } catch (err) {
    next(err);
  }
};

// ───────────────────────────────────────────────────────────────
// STEP 2c — Set Password
// POST /api/auth/signup/set-password
// Body: { userId, password, confirmPassword }
// ───────────────────────────────────────────────────────────────
exports.setPassword = async (req, res, next) => {
  try {
    const { userId, password, confirmPassword } = req.body;

    if (!userId || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'userId, password and confirmPassword are required.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters and contain at least 1 letter and 1 number.',
      });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Phone users must verify first
    if (user.phone && !user.isPhoneVerified) {
      return res.status(400).json({ success: false, message: 'Please verify your phone number first.' });
    }

    user.password = password; // hashed by pre-save hook

    // Mark which auth methods are now available
    if (user.phone) {
      user.authMethods.phoneOtp      = true;
      user.authMethods.phonePassword = true;
    }
    if (user.email) {
      user.authMethods.emailPassword = true;
    }

    await user.save();

    res.status(200).json({
      success:  true,
      message:  'Password set successfully!',
      userId:   user._id,
      nextStep: 'complete-profile',
    });
  } catch (err) {
    next(err);
  }
};

// ───────────────────────────────────────────────────────────────
// STEP 3 — Complete Profile (avatar + use case) → issues JWT
// POST /api/auth/signup/complete-profile
// Body: { userId, avatar?, useCase }
// ───────────────────────────────────────────────────────────────
exports.completeProfile = async (req, res, next) => {
  try {
    const { userId, avatar, useCase } = req.body;

    if (!userId) return res.status(400).json({ success: false, message: 'userId is required.' });

    const validUseCases = ['split', 'freelance', 'both'];
    if (useCase && !validUseCases.includes(useCase)) {
      return res.status(400).json({ success: false, message: 'useCase must be: split, freelance, or both.' });
    }

    const validAvatars = ['😎', '🧑‍💻', '👩‍💼', '🧑‍🎨', '👨‍🍳', '🦸'];
    if (avatar && !validAvatars.includes(avatar)) {
      return res.status(400).json({ success: false, message: 'Invalid avatar selection.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Guard: password must be set
    const freshUser = await User.findById(userId).select('+password');
    if (!freshUser.password || freshUser.password === '__TEMP__PLACEHOLDER') {
      return res.status(400).json({ success: false, message: 'Please set your password before completing profile.' });
    }

    if (avatar)   user.avatar  = avatar;
    if (useCase)  user.useCase = useCase;
    user.isProfileComplete = true;

    await user.save();

    // 🎉 All done — issue JWT
    sendTokenResponse(user, 201, res, 'Account created successfully! Welcome to Hisaab 🎉');
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════════════════════════════════════════
//  LOGIN METHODS
// ═══════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────
// LOGIN — Email + Password  OR  Phone + Password
// POST /api/auth/login/password
// Body: { identifier, password }
// identifier = email or phone
// ───────────────────────────────────────────────────────────────
exports.loginWithPassword = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Identifier (phone/email) and password are required.' });
    }

    const type = detectIdentifierType(identifier.trim());
    if (!type) {
      return res.status(400).json({ success: false, message: 'Invalid phone number or email address.' });
    }

    // ── Build query ──
    let user;
    if (type === 'phone') {
      // Flexible phone search (handles +91xxxxxxxxxx or 10-digit)
      const digits = identifier.replace(/\D/g, '').slice(-10);
      user = await User.findOne({ phone: { $regex: digits + '$' } }).select('+password');
    } else {
      user = await User.findOne({ email: identifier.toLowerCase() }).select('+password');
    }

    // Generic error to prevent user enumeration
    const invalidMsg = 'Invalid credentials. Please check your details.';

    if (!user) return res.status(401).json({ success: false, message: invalidMsg });
    if (!user.isActive) return res.status(401).json({ success: false, message: 'Account deactivated. Contact support.' });

    // ── Check auth method is enabled ──
    const canLogin = type === 'phone'
      ? user.authMethods.phonePassword
      : user.authMethods.emailPassword;

    if (!canLogin) {
      return res.status(401).json({
        success: false,
        message: type === 'phone'
          ? 'This account uses OTP login. Please use Phone + OTP login instead.'
          : 'No password set for this email. Please use another login method.',
      });
    }

    // ── Phone must be verified ──
    if (type === 'phone' && !user.isPhoneVerified) {
      return res.status(401).json({
        success: false,
        message: 'Phone not verified. Please complete signup first.',
        code: 'PHONE_UNVERIFIED',
        userId: user._id,
      });
    }

    // ── Verify password ──
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: invalidMsg });

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    sendTokenResponse(user, 200, res, 'Login successful! Welcome back 👋');
  } catch (err) {
    next(err);
  }
};

// ───────────────────────────────────────────────────────────────
// LOGIN — Phone + OTP (Step 1: Request OTP)
// POST /api/auth/login/otp/request
// Body: { phone }
// ───────────────────────────────────────────────────────────────
exports.loginOtpRequest = async (req, res, next) => {
  try {
    const { phone } = req.body;

    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required.' });
    if (!isValidPhone(phone)) return res.status(400).json({ success: false, message: 'Invalid phone number.' });

    const digits = phone.replace(/\D/g, '').slice(-10);
    const user = await User.findOne({ phone: { $regex: digits + '$' } });

    if (!user || !user.isPhoneVerified) {
      return res.status(404).json({
        success: false,
        message: 'No verified account found with this phone. Please sign up.',
        code: 'USER_NOT_FOUND',
      });
    }
    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account deactivated. Contact support.' });
    }

    const otp = generateOTP();
    user.otp   = buildOTPPayload(otp, 'login');
    await user.save();
    await sendOTP(phone, otp, 'login');

    res.status(200).json({
      success: true,
      message: `Login OTP sent to ${phone}.`,
      userId:  user._id,
    });
  } catch (err) {
    next(err);
  }
};

// ───────────────────────────────────────────────────────────────
// LOGIN — Phone + OTP (Step 2: Verify OTP → issue JWT)
// POST /api/auth/login/otp/verify
// Body: { userId, otp }
// ───────────────────────────────────────────────────────────────
exports.loginOtpVerify = async (req, res, next) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ success: false, message: 'userId and otp are required.' });
    }

    const user = await User.findById(userId).select('+otp.code +otp.expiresAt +otp.attempts +otp.purpose');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (user.otp?.purpose !== 'login') {
      return res.status(400).json({ success: false, message: 'No login OTP found. Please request a new one.' });
    }

    const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS) || 5;
    if ((user.otp?.attempts || 0) >= maxAttempts) {
      return res.status(429).json({ success: false, message: 'Too many attempts. Request a new OTP.' });
    }
    if (!user.otp?.expiresAt || new Date() > user.otp.expiresAt) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.', code: 'OTP_EXPIRED' });
    }
    if (user.otp.code !== otp.trim()) {
      user.otp.attempts += 1;
      await user.save();
      const remaining = maxAttempts - user.otp.attempts;
      return res.status(400).json({ success: false, message: `Incorrect OTP. ${remaining} attempt(s) remaining.` });
    }

    // ── ✅ Valid ──
    user.otp       = undefined;
    user.lastLogin = new Date();
    await user.save();

    sendTokenResponse(user, 200, res, 'Login successful! Welcome back 👋');
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════════════════════════════════════════
//  FORGOT / RESET PASSWORD
// ═══════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// Body: { identifier }  — phone or email
// ───────────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ success: false, message: 'Phone or email is required.' });

    const type = detectIdentifierType(identifier.trim());

    let user;
    if (type === 'phone') {
      const digits = identifier.replace(/\D/g, '').slice(-10);
      user = await User.findOne({ phone: { $regex: digits + '$' } });
    } else if (type === 'email') {
      user = await User.findOne({ email: identifier.toLowerCase() });
    }

    // Always return 200 — prevents user enumeration
    const genericMsg = 'If an account exists, an OTP has been sent.';

    if (!user || !user.isActive) {
      return res.status(200).json({ success: true, message: genericMsg });
    }

    const otp   = generateOTP();
    user.otp    = buildOTPPayload(otp, 'reset');
    await user.save();

    // Send to phone or log (email support can be added later)
    if (user.phone) {
      await sendOTP(user.phone, otp, 'reset');
    } else {
      // TODO: send reset email
      console.log(`📧 [MOCK EMAIL] Reset OTP for ${user.email}: ${otp}`);
    }

    res.status(200).json({
      success: true,
      message: genericMsg,
      userId:  user._id,  // OK to return in dev; remove in prod if desired
    });
  } catch (err) {
    next(err);
  }
};

// ───────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// Body: { userId, otp, newPassword, confirmPassword }
// ───────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { userId, otp, newPassword, confirmPassword } = req.body;

    if (!userId || !otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters with 1 letter and 1 number.',
      });
    }

    const user = await User.findById(userId).select('+otp.code +otp.expiresAt +otp.attempts +otp.purpose');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (user.otp?.purpose !== 'reset') {
      return res.status(400).json({ success: false, message: 'No password reset OTP found. Please request one.' });
    }
    if (!user.otp?.expiresAt || new Date() > user.otp.expiresAt) {
      return res.status(400).json({ success: false, message: 'OTP expired.', code: 'OTP_EXPIRED' });
    }
    if (user.otp.code !== otp.trim()) {
      user.otp.attempts += 1;
      await user.save();
      return res.status(400).json({ success: false, message: 'Incorrect OTP.' });
    }

    user.password = newPassword; // hashed by pre-save hook
    user.otp      = undefined;

    // Enable password-based login if not already
    if (user.phone) user.authMethods.phonePassword = true;
    if (user.email) user.authMethods.emailPassword = true;

    await user.save();
    sendTokenResponse(user, 200, res, 'Password reset successfully. You are now logged in.');
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════════════════════════════════════════
//  PROFILE
// ═══════════════════════════════════════════════════════════════

// GET /api/auth/me
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.status(200).json({ success: true, user: user.toPublicJSON() });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/auth/me
// Body: { name?, avatar?, useCase? }
exports.updateMe = async (req, res, next) => {
  try {
    const { name, avatar, useCase } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (name) {
      if (name.trim().length < 2) return res.status(400).json({ success: false, message: 'Name too short.' });
      user.name = name.trim();
    }
    if (avatar) {
      const validAvatars = ['😎', '🧑‍💻', '👩‍💼', '🧑‍🎨', '👨‍🍳', '🦸'];
      if (!validAvatars.includes(avatar)) return res.status(400).json({ success: false, message: 'Invalid avatar.' });
      user.avatar = avatar;
    }
    if (useCase) {
      const valid = ['split', 'freelance', 'both'];
      if (!valid.includes(useCase)) return res.status(400).json({ success: false, message: 'Invalid useCase.' });
      user.useCase = useCase;
    }

    await user.save();
    res.status(200).json({ success: true, message: 'Profile updated.', user: user.toPublicJSON() });
  } catch (err) {
    next(err);
  }
};
