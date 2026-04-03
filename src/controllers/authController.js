const User = require("../models/User");
const { generateOTP, sendOTP, buildOTPPayload } = require("../utils/otp");
const { sendTokenResponse } = require("../utils/jwt");
const { sendSuccess, sendError } = require("../utils/response");
const {
    isValidPhone,
    isValidEmail,
    isValidPassword,
    detectIdentifierType,
    normalizePhone,
} = require("../utils/validators");

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

const MAX_OTP_ATTEMPTS = () => Number(process.env.OTP_MAX_ATTEMPTS) || 5;

// Validate OTP generically — returns error string or null
function validateOTP(user, purpose) {
    if (!user.otp?.code) return "No OTP found. Please request a new one.";
    if (user.otp.purpose !== purpose)
        return `Invalid OTP purpose. Expected: ${purpose}.`;
    if ((user.otp.attempts || 0) >= MAX_OTP_ATTEMPTS())
        return "Too many incorrect attempts. Please request a new OTP.";
    if (!user.otp.expiresAt || new Date() > user.otp.expiresAt)
        return "OTP has expired. Please request a new one.";
    return null;
}

// ═══════════════════════════════════════════════════════════════
//  SIGNUP FLOW (3 steps)
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/signup/step1
// Body: { name, phone?, email? }
exports.signupStep1 = async (req, res, next) => {
    try {
        const { name, phone, email } = req.body;

        if (!name || name.trim().length < 2)
            return sendError(res, "Name must be at least 2 characters.", "400");
        if (!phone && !email)
            return sendError(
                res,
                "At least phone or email is required.",
                "400",
            );
        if (phone && !isValidPhone(phone))
            return sendError(
                res,
                "Invalid phone number. Use a 10-digit Indian number.",
                "400",
            );
        if (email && !isValidEmail(email))
            return sendError(res, "Invalid email address.", "400");

        // ── BUG FIX: fully normalize phone before DB lookup ────────
        // Use exact match, not partial regex, to avoid false positives
        let normalizedPhone = null;
        if (phone) {
            normalizedPhone = normalizePhone(phone);

            const existingPhone = await User.findOne({
                phone: normalizedPhone,
            });
            if (existingPhone && existingPhone.isPhoneVerified)
                return sendError(
                    res,
                    "Phone number already registered. Please login.",
                    "409",
                );
        }

        if (email) {
            const existingEmail = await User.findOne({
                email: email.toLowerCase(),
            });
            if (existingEmail && existingEmail.isEmailVerified)
                return sendError(
                    res,
                    "Email already registered. Please login.",
                    "409",
                );
        }

        // Generate OTP for phone users
        let otp = null;
        let otpPayload = null;
        if (normalizedPhone) {
            otp = generateOTP();
            otpPayload = buildOTPPayload(otp, "signup");
        }

        // Find or create user — use exact phone match
        const query = normalizedPhone
            ? { phone: normalizedPhone }
            : { email: email.toLowerCase() };

        let user = await User.findOne(query);

        if (user) {
            user.name = name.trim();
            if (email) user.email = email.toLowerCase();
            if (otpPayload) user.otp = otpPayload;
            // ── BUG FIX: do NOT set a temp password placeholder ──────
            // Leave password untouched — it stays undefined until set-password step
        } else {
            user = new User({
                name: name.trim(),
                phone: normalizedPhone || undefined,
                email: email || undefined,
                // No password set here — set in step 2b
                otp: otpPayload || undefined,
            });
        }

        await user.save();

        if (normalizedPhone && otp)
            await sendOTP(normalizedPhone, otp, "signup");

        return sendSuccess(
            res,
            {
                userId: user._id,
                nextStep: normalizedPhone ? "verify-otp" : "set-password",
            },
            normalizedPhone
                ? `OTP sent to ${normalizedPhone}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.`
                : "Basic info saved. Proceed to set your password.",
        );
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/signup/verify-otp
// Body: { userId, otp }
exports.verifyOTP = async (req, res, next) => {
    try {
        const { userId, otp } = req.body;

        if (!userId || !otp)
            return sendError(res, "userId and otp are required.", "400");

        const user = await User.findById(userId).select(
            "+otp.code +otp.expiresAt +otp.attempts +otp.purpose",
        );
        if (!user) return sendError(res, "User not found.", "404");

        if (user.isPhoneVerified && user.otp?.purpose === "signup")
            return sendError(
                res,
                "Phone already verified. Proceed to set password.",
                "400",
            );

        // ── BUG FIX: reject OTPs that were not issued for signup ──
        const otpErr = validateOTP(user, "signup");
        if (otpErr) return sendError(res, otpErr, "400");

        if (user.otp.code !== otp.trim()) {
            user.otp.attempts += 1;
            await user.save({ validateBeforeSave: false });
            const remaining = MAX_OTP_ATTEMPTS() - user.otp.attempts;
            return sendError(
                res,
                `Incorrect OTP. ${remaining} attempt(s) remaining.`,
                "400",
                { attemptsRemaining: remaining },
            );
        }

        user.isPhoneVerified = true;
        user.otp = undefined;
        await user.save({ validateBeforeSave: false });

        return sendSuccess(
            res,
            { userId: user._id, nextStep: "set-password" },
            "Phone verified successfully!",
        );
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/signup/resend-otp
// Body: { userId }
exports.resendOTP = async (req, res, next) => {
    try {
        const { userId } = req.body;
        if (!userId) return sendError(res, "userId is required.", "400");

        const user = await User.findById(userId);
        if (!user) return sendError(res, "User not found.", "404");
        if (!user.phone)
            return sendError(res, "No phone number on this account.", "400");
        if (user.isPhoneVerified)
            return sendError(res, "Phone already verified.", "400");

        const otp = generateOTP();
        user.otp = buildOTPPayload(otp, "signup");
        await user.save({ validateBeforeSave: false });
        await sendOTP(user.phone, otp, "signup");

        return sendSuccess(res, null, `New OTP sent to ${user.phone}.`);
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/signup/set-password
// Body: { userId, password, confirmPassword }
exports.setPassword = async (req, res, next) => {
    try {
        const { userId, password, confirmPassword } = req.body;

        if (!userId || !password || !confirmPassword)
            return sendError(
                res,
                "userId, password and confirmPassword are required.",
                "400",
            );
        if (password !== confirmPassword)
            return sendError(res, "Passwords do not match.", "400");
        if (!isValidPassword(password))
            return sendError(
                res,
                "Password must be at least 8 characters and contain at least 1 letter and 1 number.",
                "400",
            );

        const user = await User.findById(userId);
        if (!user) return sendError(res, "User not found.", "404");

        if (user.phone && !user.isPhoneVerified)
            return sendError(
                res,
                "Please verify your phone number first.",
                "400",
            );

        user.password = password;
        if (user.phone) {
            user.authMethods.phoneOtp = true;
            user.authMethods.phonePassword = true;
        }
        if (user.email) {
            user.authMethods.emailPassword = true;
        }

        await user.save();

        return sendSuccess(
            res,
            { userId: user._id, nextStep: "complete-profile" },
            "Password set successfully!",
        );
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/signup/complete-profile
// Body: { userId, avatar?, avatarColor?, useCase }
exports.completeProfile = async (req, res, next) => {
    try {
        const { userId, avatar, avatarColor, useCase } = req.body;

        if (!userId) return sendError(res, "userId is required.", "400");

        const validUseCases = ["split", "freelance", "both"];
        if (useCase && !validUseCases.includes(useCase))
            return sendError(
                res,
                "useCase must be: split, freelance, or both.",
                "400",
            );

        const validAvatars = ["😎", "🧑‍💻", "👩‍💼", "🧑‍🎨", "👨‍🍳", "🦸"];
        if (avatar && !validAvatars.includes(avatar))
            return sendError(res, "Invalid avatar selection.", "400");

        // ── BUG FIX: single query with +password select ────────────
        // Old code did two separate DB calls — now one
        const user = await User.findById(userId).select(
            "+password +tokenVersion",
        );
        if (!user) return sendError(res, "User not found.", "404");

        if (!user.password)
            return sendError(
                res,
                "Please set your password before completing profile.",
                "400",
            );

        if (avatar) user.avatar = avatar;
        if (avatarColor) user.avatarColor = avatarColor;
        if (useCase) user.useCase = useCase;
        user.isProfileComplete = true;

        await user.save({ validateBeforeSave: false });

        return sendTokenResponse(
            user,
            201,
            res,
            "Account created successfully! Welcome to Hisaab 🎉",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/login/password
// Body: { identifier, password }
exports.loginWithPassword = async (req, res, next) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password)
            return sendError(
                res,
                "Identifier (phone/email) and password are required.",
                "400",
            );

        const type = detectIdentifierType(identifier.trim());
        if (!type)
            return sendError(
                res,
                "Invalid phone number or email address.",
                "400",
            );

        let user;
        if (type === "phone") {
            // ── BUG FIX: normalize fully before lookup, exact match ──
            const normalized = normalizePhone(identifier);
            user = await User.findOne({ phone: normalized }).select(
                "+password +tokenVersion",
            );
        } else {
            user = await User.findOne({
                email: identifier.toLowerCase(),
            }).select("+password +tokenVersion");
        }

        const invalidMsg = "Invalid credentials. Please check your details.";
        if (!user) return sendError(res, invalidMsg, "401");
        if (!user.isActive)
            return sendError(
                res,
                "Account deactivated. Contact support.",
                "401",
            );

        const canLogin =
            type === "phone"
                ? user.authMethods.phonePassword
                : user.authMethods.emailPassword;

        if (!canLogin)
            return sendError(
                res,
                type === "phone"
                    ? "This account uses OTP login. Please use Phone + OTP login instead."
                    : "No password set for this email. Please use another login method.",
                "401",
            );

        if (type === "phone" && !user.isPhoneVerified)
            return sendError(
                res,
                "Phone not verified. Please complete signup first.",
                "401",
            );

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return sendError(res, invalidMsg, "401");

        return sendTokenResponse(
            user,
            200,
            res,
            "Login successful! Welcome back 👋",
        );
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/login/otp/request
// Body: { phone }
exports.loginOtpRequest = async (req, res, next) => {
    try {
        const { phone } = req.body;

        if (!phone) return sendError(res, "Phone number is required.", "400");
        if (!isValidPhone(phone))
            return sendError(res, "Invalid phone number.", "400");

        // ── BUG FIX: exact match after full normalization ─────────
        const normalized = normalizePhone(phone);
        const user = await User.findOne({ phone: normalized });

        if (!user || !user.isPhoneVerified)
            return sendError(
                res,
                "No verified account found with this phone. Please sign up.",
                "404",
            );
        if (!user.isActive)
            return sendError(
                res,
                "Account deactivated. Contact support.",
                "401",
            );

        const otp = generateOTP();
        user.otp = buildOTPPayload(otp, "login");
        await user.save({ validateBeforeSave: false });
        await sendOTP(normalized, otp, "login");

        return sendSuccess(
            res,
            { userId: user._id },
            `Login OTP sent to ${normalized}.`,
        );
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/login/otp/verify
// Body: { userId, otp }
exports.loginOtpVerify = async (req, res, next) => {
    try {
        const { userId, otp } = req.body;

        if (!userId || !otp)
            return sendError(res, "userId and otp are required.", "400");

        const user = await User.findById(userId).select(
            "+otp.code +otp.expiresAt +otp.attempts +otp.purpose +tokenVersion",
        );
        if (!user) return sendError(res, "User not found.", "404");

        const otpErr = validateOTP(user, "login");
        if (otpErr) return sendError(res, otpErr, "400");

        if (user.otp.code !== otp.trim()) {
            user.otp.attempts += 1;
            await user.save({ validateBeforeSave: false });
            const remaining = MAX_OTP_ATTEMPTS() - user.otp.attempts;
            return sendError(
                res,
                `Incorrect OTP. ${remaining} attempt(s) remaining.`,
                "400",
            );
        }

        user.otp = undefined;
        return sendTokenResponse(
            user,
            200,
            res,
            "Login successful! Welcome back 👋",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
//  FORGOT / RESET PASSWORD
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/forgot-password
// Body: { identifier }   (phone or email)
exports.forgotPassword = async (req, res, next) => {
    try {
        const { identifier } = req.body;
        if (!identifier)
            return sendError(res, "Phone or email is required.", "400");

        const type = detectIdentifierType(identifier.trim());
        const genericMsg = "If an account exists, an OTP has been sent.";

        let user;
        if (type === "phone") {
            const normalized = normalizePhone(identifier);
            user = await User.findOne({ phone: normalized });
        } else if (type === "email") {
            user = await User.findOne({ email: identifier.toLowerCase() });
        } else {
            return sendSuccess(res, null, genericMsg); // don't reveal invalid format
        }

        if (!user || !user.isActive) return sendSuccess(res, null, genericMsg);

        const otp = generateOTP();
        user.otp = buildOTPPayload(otp, "reset");
        await user.save({ validateBeforeSave: false });

        if (user.phone) {
            await sendOTP(user.phone, otp, "reset");
        } else {
            console.log(`📧 [MOCK EMAIL] Reset OTP for ${user.email}: ${otp}`);
        }

        return sendSuccess(res, { userId: user._id }, genericMsg);
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/reset-password
// Body: { userId, otp, newPassword, confirmPassword }
exports.resetPassword = async (req, res, next) => {
    try {
        const { userId, otp, newPassword, confirmPassword } = req.body;

        if (!userId || !otp || !newPassword || !confirmPassword)
            return sendError(res, "All fields are required.", "400");
        if (newPassword !== confirmPassword)
            return sendError(res, "Passwords do not match.", "400");
        if (!isValidPassword(newPassword))
            return sendError(
                res,
                "Password must be at least 8 characters with 1 letter and 1 number.",
                "400",
            );

        const user = await User.findById(userId).select(
            "+otp.code +otp.expiresAt +otp.attempts +otp.purpose +tokenVersion",
        );
        if (!user) return sendError(res, "User not found.", "404");

        const otpErr = validateOTP(user, "reset");
        if (otpErr) return sendError(res, otpErr, "400");

        if (user.otp.code !== otp.trim()) {
            user.otp.attempts += 1;
            await user.save({ validateBeforeSave: false });
            return sendError(res, "Incorrect OTP.", "400");
        }

        user.password = newPassword;
        user.otp = undefined;

        if (user.phone) user.authMethods.phonePassword = true;
        if (user.email) user.authMethods.emailPassword = true;

        // Invalidate all existing sessions on password reset
        user.tokenVersion += 1;

        await user.save();

        // ── BUG FIX: update lastLogin on reset (was missing) ──────
        return sendTokenResponse(
            user,
            200,
            res,
            "Password reset successfully. You are now logged in.",
        );
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
        if (!user) return sendError(res, "User not found.", "404");
        return sendSuccess(
            res,
            { user: user.toPublicJSON() },
            "Profile fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// PATCH /api/auth/me
// Body: { name?, avatar?, avatarColor?, useCase? }
exports.updateMe = async (req, res, next) => {
    try {
        const { name, avatar, avatarColor, useCase } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return sendError(res, "User not found.", "404");

        if (name) {
            if (name.trim().length < 2)
                return sendError(res, "Name too short.", "400");
            user.name = name.trim();
        }
        if (avatar) {
            const validAvatars = ["😎", "🧑‍💻", "👩‍💼", "🧑‍🎨", "👨‍🍳", "🦸"];
            if (!validAvatars.includes(avatar))
                return sendError(res, "Invalid avatar.", "400");
            user.avatar = avatar;
        }
        if (avatarColor) user.avatarColor = avatarColor;
        if (useCase) {
            const valid = ["split", "freelance", "both"];
            if (!valid.includes(useCase))
                return sendError(res, "Invalid useCase.", "400");
            user.useCase = useCase;
        }

        await user.save({ validateBeforeSave: false });
        return sendSuccess(
            res,
            { user: user.toPublicJSON() },
            "Profile updated.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
//  NEW: LOGOUT
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/logout   (protected)
// Increments tokenVersion → all existing access tokens become invalid
// Also clears refresh token and optionally removes a device FCM token
exports.logout = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select(
            "+tokenVersion +refreshToken",
        );
        if (!user) return sendError(res, "User not found.", "404");

        // Increment version → JWT middleware will reject all old tokens
        user.tokenVersion += 1;
        user.refreshToken = undefined;

        // Optionally remove a specific device token (sent from mobile on logout)
        const { deviceToken } = req.body;
        if (deviceToken) {
            user.deviceTokens = user.deviceTokens.filter(
                (d) => d.token !== deviceToken,
            );
        }

        await user.save({ validateBeforeSave: false });

        return sendSuccess(res, null, "Logged out successfully.");
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
//  NEW: REFRESH TOKEN
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/refresh
// Body: { userId, refreshToken }
// Returns a new accessToken (does NOT rotate the refresh token unless near expiry)
exports.refreshToken = async (req, res, next) => {
    try {
        const { userId, refreshToken } = req.body;

        if (!userId || !refreshToken)
            return sendError(
                res,
                "userId and refreshToken are required.",
                "400",
            );

        const user = await User.findById(userId).select(
            "+refreshToken +tokenVersion",
        );

        if (!user) return sendError(res, "User not found.", "401");
        if (!user.isActive)
            return sendError(res, "Account deactivated.", "401");
        if (!user.refreshToken)
            return sendError(
                res,
                "No active session. Please login again.",
                "401",
            );

        // Compare the raw token sent by client against the hashed one in DB
        const isValid = await user.compareRefreshToken(refreshToken);
        if (!isValid)
            return sendError(
                res,
                "Invalid or expired refresh token. Please login again.",
                "401",
            );

        // Issue new access token with current tokenVersion
        const { signAccessToken } = require("../utils/jwt");
        const newAccessToken = signAccessToken(user._id, user.tokenVersion);

        return sendSuccess(
            res,
            {
                accessToken: newAccessToken,
                expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
            },
            "Token refreshed successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
//  NEW: CHANGE PASSWORD  (logged in user)
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/change-password   (protected)
// Body: { currentPassword, newPassword, confirmPassword }
exports.changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword)
            return sendError(
                res,
                "currentPassword, newPassword, and confirmPassword are required.",
                "400",
            );

        if (newPassword !== confirmPassword)
            return sendError(res, "New passwords do not match.", "400");

        if (!isValidPassword(newPassword))
            return sendError(
                res,
                "New password must be at least 8 characters with 1 letter and 1 number.",
                "400",
            );

        if (currentPassword === newPassword)
            return sendError(
                res,
                "New password must be different from your current password.",
                "400",
            );

        const user = await User.findById(req.user.id).select(
            "+password +tokenVersion",
        );
        if (!user) return sendError(res, "User not found.", "404");

        if (!user.password)
            return sendError(
                res,
                "No password set on this account. Use forgot password.",
                "400",
            );

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch)
            return sendError(res, "Current password is incorrect.", "401");

        user.password = newPassword;
        // Invalidate all OTHER sessions — current session gets a fresh token
        user.tokenVersion += 1;
        user.refreshToken = undefined;

        await user.save();

        // Issue fresh tokens so the current session stays logged in
        return sendTokenResponse(
            user,
            200,
            res,
            "Password changed successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
//  NEW: UPDATE PHONE (with re-verification)
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/update-phone/request   (protected)
// Body: { newPhone }
// Sends OTP to the NEW phone number for verification
exports.updatePhoneRequest = async (req, res, next) => {
    try {
        const { newPhone } = req.body;

        if (!newPhone) return sendError(res, "newPhone is required.", "400");
        if (!isValidPhone(newPhone))
            return sendError(
                res,
                "Invalid phone number. Use a 10-digit Indian number.",
                "400",
            );

        const normalized = normalizePhone(newPhone);

        // Check the new phone isn't already taken by another account
        const existing = await User.findOne({ phone: normalized });
        if (existing && existing._id.toString() !== req.user.id.toString())
            return sendError(
                res,
                "This phone number is already registered to another account.",
                "409",
            );

        // Check it's not the same as current phone
        if (req.user.phone === normalized)
            return sendError(
                res,
                "This is already your current phone number.",
                "400",
            );

        const otp = generateOTP();
        const user = await User.findById(req.user.id).select(
            "+otp.code +otp.expiresAt +otp.attempts +otp.purpose +otp.pendingPhone",
        );
        if (!user) return sendError(res, "User not found.", "404");

        user.otp = {
            ...buildOTPPayload(otp, "updatePhone"),
            pendingPhone: normalized, // store new phone here until verified
        };

        await user.save({ validateBeforeSave: false });
        await sendOTP(normalized, otp, "updatePhone");

        return sendSuccess(
            res,
            { nextStep: "verify-new-phone" },
            `OTP sent to ${normalized}. Verify to complete phone update.`,
        );
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/update-phone/verify   (protected)
// Body: { otp }
// Verifies OTP on the new phone and updates the phone field
exports.updatePhoneVerify = async (req, res, next) => {
    try {
        const { otp } = req.body;

        if (!otp) return sendError(res, "otp is required.", "400");

        const user = await User.findById(req.user.id).select(
            "+otp.code +otp.expiresAt +otp.attempts +otp.purpose +otp.pendingPhone +tokenVersion",
        );
        if (!user) return sendError(res, "User not found.", "404");

        const otpErr = validateOTP(user, "updatePhone");
        if (otpErr) return sendError(res, otpErr, "400");

        if (!user.otp.pendingPhone)
            return sendError(
                res,
                "No pending phone update. Please request again.",
                "400",
            );

        if (user.otp.code !== otp.trim()) {
            user.otp.attempts += 1;
            await user.save({ validateBeforeSave: false });
            const remaining = MAX_OTP_ATTEMPTS() - user.otp.attempts;
            return sendError(
                res,
                `Incorrect OTP. ${remaining} attempt(s) remaining.`,
                "400",
            );
        }

        const newPhone = user.otp.pendingPhone;
        user.phone = newPhone;
        user.isPhoneVerified = true;
        user.authMethods.phoneOtp = true;
        user.authMethods.phonePassword = true;
        user.otp = undefined;

        // Invalidate all other sessions after phone change (security)
        user.tokenVersion += 1;
        user.refreshToken = undefined;

        await user.save();

        // Re-issue tokens so current device stays logged in
        return sendTokenResponse(
            user,
            200,
            res,
            `Phone number updated to ${newPhone} successfully.`,
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
//  NEW: DELETE ACCOUNT
// ═══════════════════════════════════════════════════════════════

// DELETE /api/auth/me   (protected)
// Body: { password? }  — optional password confirmation for safety
// Soft-deletes: anonymizes PII, marks isActive: false
// (App Store & Google Play require account deletion option)
exports.deleteAccount = async (req, res, next) => {
    try {
        const { password } = req.body;

        const user = await User.findById(req.user.id).select(
            "+password +tokenVersion",
        );
        if (!user) return sendError(res, "User not found.", "404");

        // If user has a password, require confirmation before deleting
        if (user.password && password !== undefined) {
            const isMatch = await user.comparePassword(password);
            if (!isMatch)
                return sendError(
                    res,
                    "Password confirmation is incorrect.",
                    "401",
                );
        }

        // ── Soft delete: anonymize PII ────────────────────────────
        // We keep the record for referential integrity (expenses, groups etc.)
        // but strip all personally identifying information
        const anonymousId = `deleted_${user._id}`;

        user.name = "Deleted User";
        user.phone = undefined; // unset sparse unique field
        user.email = undefined; // unset sparse unique field
        user.password = undefined;
        user.refreshToken = undefined;
        user.deviceTokens = [];
        user.otp = undefined;
        user.isActive = false;
        user.isProfileComplete = false;
        user.tokenVersion += 1; // invalidate all tokens immediately

        await user.save({ validateBeforeSave: false });

        return sendSuccess(
            res,
            null,
            "Account deleted successfully. We're sorry to see you go.",
        );
    } catch (err) {
        next(err);
    }
};
