const User = require("../models/User");
const { generateOTP, sendOTP, buildOTPPayload } = require("../utils/otp");
const { sendTokenResponse } = require("../utils/jwt");
const { sendSuccess, sendError } = require("../utils/response");
const {
    isValidPhone,
    isValidEmail,
    isValidPassword,
    detectIdentifierType,
} = require("../utils/validators");

// ═══════════════════════════════════════════════════════════════
//  SIGNUP FLOW  (3 steps)
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/signup/step1
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
                "Invalid phone number. Use 10-digit Indian number.",
                "400",
            );
        if (email && !isValidEmail(email))
            return sendError(res, "Invalid email address.", "400");

        if (phone) {
            const normalizedPhone = phone
                .replace(/\s+/g, "")
                .replace(/^(?!\+)91/, "+91")
                .replace(/^(?!\+91)/, "+91");
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

        let otp = null;
        let otpPayload = null;
        if (phone) {
            otp = generateOTP();
            otpPayload = buildOTPPayload(otp, "signup");
        }

        const query = phone
            ? {
                  phone: {
                      $regex: phone.replace(/\s+/g, "").replace(/^91/, ""),
                  },
              }
            : { email: email.toLowerCase() };

        let user = await User.findOne(query);

        if (user) {
            user.name = name.trim();
            if (email) user.email = email.toLowerCase();
            if (phone) user.phone = phone;
            if (otpPayload) user.otp = otpPayload;
            user.password = user.password || "__TEMP__PLACEHOLDER";
        } else {
            user = new User({
                name: name.trim(),
                phone: phone || undefined,
                email: email || undefined,
                password: "__TEMP__PLACEHOLDER",
                otp: otpPayload || undefined,
            });
        }

        await user.save();

        if (phone && otp) await sendOTP(phone, otp, "signup");

        return sendSuccess(
            res,
            {
                userId: user._id,
                nextStep: phone ? "verify-otp" : "set-password",
            },
            phone
                ? `OTP sent to ${phone}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.`
                : "Basic info saved. Proceed to set your password.",
        );
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

        const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS) || 5;
        if ((user.otp?.attempts || 0) >= maxAttempts)
            return sendError(
                res,
                "Too many incorrect attempts. Please request a new OTP.",
                "429",
            );

        if (!user.otp?.expiresAt || new Date() > user.otp.expiresAt)
            return sendError(
                res,
                "OTP has expired. Please request a new one.",
                "400",
            );

        if (user.otp.code !== otp.trim()) {
            user.otp.attempts += 1;
            await user.save();
            const remaining = maxAttempts - user.otp.attempts;
            return sendError(
                res,
                `Incorrect OTP. ${remaining} attempt(s) remaining.`,
                "400",
                { attemptsRemaining: remaining },
            );
        }

        user.isPhoneVerified = true;
        user.otp = undefined;
        await user.save();

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
        await user.save();
        await sendOTP(user.phone, otp, "signup");

        return sendSuccess(res, null, `New OTP sent to ${user.phone}.`);
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/signup/set-password
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
exports.completeProfile = async (req, res, next) => {
    try {
        const { userId, avatar, useCase } = req.body;

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

        const user = await User.findById(userId);
        if (!user) return sendError(res, "User not found.", "404");

        const freshUser = await User.findById(userId).select("+password");
        if (!freshUser.password || freshUser.password === "__TEMP__PLACEHOLDER")
            return sendError(
                res,
                "Please set your password before completing profile.",
                "400",
            );

        if (avatar) user.avatar = avatar;
        if (useCase) user.useCase = useCase;
        user.isProfileComplete = true;

        await user.save();

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
//  LOGIN METHODS
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/login/password
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
            const digits = identifier.replace(/\D/g, "").slice(-10);
            user = await User.findOne({
                phone: { $regex: digits + "$" },
            }).select("+password");
        } else {
            user = await User.findOne({
                email: identifier.toLowerCase(),
            }).select("+password");
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

        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

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
exports.loginOtpRequest = async (req, res, next) => {
    try {
        const { phone } = req.body;

        if (!phone) return sendError(res, "Phone number is required.", "400");
        if (!isValidPhone(phone))
            return sendError(res, "Invalid phone number.", "400");

        const digits = phone.replace(/\D/g, "").slice(-10);
        const user = await User.findOne({ phone: { $regex: digits + "$" } });

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
        await user.save();
        await sendOTP(phone, otp, "login");

        return sendSuccess(
            res,
            { userId: user._id },
            `Login OTP sent to ${phone}.`,
        );
    } catch (err) {
        next(err);
    }
};

// POST /api/auth/login/otp/verify
exports.loginOtpVerify = async (req, res, next) => {
    try {
        const { userId, otp } = req.body;

        if (!userId || !otp)
            return sendError(res, "userId and otp are required.", "400");

        const user = await User.findById(userId).select(
            "+otp.code +otp.expiresAt +otp.attempts +otp.purpose",
        );
        if (!user) return sendError(res, "User not found.", "404");

        if (user.otp?.purpose !== "login")
            return sendError(
                res,
                "No login OTP found. Please request a new one.",
                "400",
            );

        const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS) || 5;
        if ((user.otp?.attempts || 0) >= maxAttempts)
            return sendError(
                res,
                "Too many attempts. Request a new OTP.",
                "429",
            );
        if (!user.otp?.expiresAt || new Date() > user.otp.expiresAt)
            return sendError(
                res,
                "OTP expired. Please request a new one.",
                "400",
            );
        if (user.otp.code !== otp.trim()) {
            user.otp.attempts += 1;
            await user.save();
            const remaining = maxAttempts - user.otp.attempts;
            return sendError(
                res,
                `Incorrect OTP. ${remaining} attempt(s) remaining.`,
                "400",
            );
        }

        user.otp = undefined;
        user.lastLogin = new Date();
        await user.save();

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
exports.forgotPassword = async (req, res, next) => {
    try {
        const { identifier } = req.body;
        if (!identifier)
            return sendError(res, "Phone or email is required.", "400");

        const type = detectIdentifierType(identifier.trim());

        let user;
        if (type === "phone") {
            const digits = identifier.replace(/\D/g, "").slice(-10);
            user = await User.findOne({ phone: { $regex: digits + "$" } });
        } else if (type === "email") {
            user = await User.findOne({ email: identifier.toLowerCase() });
        }

        const genericMsg = "If an account exists, an OTP has been sent.";

        if (!user || !user.isActive) return sendSuccess(res, null, genericMsg);

        const otp = generateOTP();
        user.otp = buildOTPPayload(otp, "reset");
        await user.save();

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
            "+otp.code +otp.expiresAt +otp.attempts +otp.purpose",
        );
        if (!user) return sendError(res, "User not found.", "404");

        if (user.otp?.purpose !== "reset")
            return sendError(
                res,
                "No password reset OTP found. Please request one.",
                "400",
            );
        if (!user.otp?.expiresAt || new Date() > user.otp.expiresAt)
            return sendError(res, "OTP expired.", "400");
        if (user.otp.code !== otp.trim()) {
            user.otp.attempts += 1;
            await user.save();
            return sendError(res, "Incorrect OTP.", "400");
        }

        user.password = newPassword;
        user.otp = undefined;

        // Enable password-based login if not already
        if (user.phone) user.authMethods.phonePassword = true;
        if (user.email) user.authMethods.emailPassword = true;

        await user.save();
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
// Body: { name?, avatar?, useCase? }
exports.updateMe = async (req, res, next) => {
    try {
        const { name, avatar, useCase } = req.body;
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
        if (useCase) {
            const valid = ["split", "freelance", "both"];
            if (!valid.includes(useCase))
                return sendError(res, "Invalid useCase.", "400");
            user.useCase = useCase;
        }

        await user.save();
        return sendSuccess(
            res,
            { user: user.toPublicJSON() },
            "Profile updated.",
        );
    } catch (err) {
        next(err);
    }
};
