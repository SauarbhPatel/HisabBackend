const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
    {
        // ─── Step 1: Basic Info ───────────────────────────────────
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            minlength: [2, "Name must be at least 2 characters"],
            maxlength: [50, "Name cannot exceed 50 characters"],
        },

        phone: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
        },

        email: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
            lowercase: true,
        },

        // ─── Step 2: Auth ─────────────────────────────────────────
        password: {
            type: String,
            minlength: [8, "Password must be at least 8 characters"],
            select: false,
        },

        authMethods: {
            phoneOtp: { type: Boolean, default: false },
            phonePassword: { type: Boolean, default: false },
            emailPassword: { type: Boolean, default: false },
        },

        isPhoneVerified: { type: Boolean, default: false },
        isEmailVerified: { type: Boolean, default: false },

        // ─── OTP ──────────────────────────────────────────────────
        otp: {
            code: { type: String, select: false },
            expiresAt: { type: Date, select: false },
            attempts: { type: Number, default: 0, select: false },
            purpose: {
                type: String,
                enum: ["signup", "login", "reset", "updatePhone"],
                select: false,
            },
            // For phone update flow — store the NEW phone pending verification
            pendingPhone: { type: String, select: false },
        },

        // ─── Step 3: Profile ──────────────────────────────────────
        avatar: {
            type: String,
            enum: ["😎", "🧑‍💻", "👩‍💼", "🧑‍🎨", "👨‍🍳", "🦸"],
            default: "😎",
        },

        avatarColor: {
            type: String,
            default: "#1a7a5e",
        },

        useCase: {
            type: String,
            enum: ["split", "freelance", "both"],
            default: "both",
        },

        // ─── Token management (logout invalidation) ───────────────
        // Increment on logout → any issued JWT with old version is rejected
        tokenVersion: {
            type: Number,
            default: 0,
            select: false,
        },

        // Refresh token (hashed before storing)
        refreshToken: {
            type: String,
            select: false,
        },

        // ─── Device tokens for push notifications ─────────────────
        deviceTokens: [
            {
                token: { type: String, required: true },
                platform: {
                    type: String,
                    // enum: ["ios", "android","web"],
                    default: "android",
                },
                updatedAt: { type: Date, default: Date.now },
            },
        ],

        // ─── Account State ────────────────────────────────────────
        isProfileComplete: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
        lastLogin: { type: Date },
    },
    { timestamps: true },
);

// ─── Normalize phone before save (+91 prefix) ────────────────
userSchema.pre("save", function (next) {
    if (this.isModified("phone") && this.phone) {
        let p = this.phone.replace(/\s+/g, "");
        if (!p.startsWith("+")) {
            p = p.replace(/^91/, "");
            p = "+91" + p;
        }
        this.phone = p;
    }
    next();
});

// ─── Hash password before save ───────────────────────────────
userSchema.pre("save", async function (next) {
    if (!this.isModified("password") || !this.password) return next();
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// ─── Hash refresh token before save ──────────────────────────
userSchema.pre("save", async function (next) {
    if (!this.isModified("refreshToken") || !this.refreshToken) return next();
    // Only hash if it doesn't look already hashed (bcrypt hashes start with $2b$)
    if (this.refreshToken.startsWith("$2b$")) return next();
    const salt = await bcrypt.genSalt(10);
    this.refreshToken = await bcrypt.hash(this.refreshToken, salt);
    next();
});

// ─── Instance: compare password ──────────────────────────────
userSchema.methods.comparePassword = async function (candidate) {
    return bcrypt.compare(candidate, this.password);
};

// ─── Instance: compare refresh token ─────────────────────────
userSchema.methods.compareRefreshToken = async function (candidate) {
    return bcrypt.compare(candidate, this.refreshToken);
};

// ─── Instance: safe public profile ───────────────────────────
userSchema.methods.toPublicJSON = function () {
    return {
        id: this._id,
        name: this.name,
        phone: this.phone || null,
        email: this.email || null,
        avatar: this.avatar,
        avatarColor: this.avatarColor,
        useCase: this.useCase,
        authMethods: this.authMethods,
        isPhoneVerified: this.isPhoneVerified,
        isEmailVerified: this.isEmailVerified,
        isProfileComplete: this.isProfileComplete,
        lastLogin: this.lastLogin,
        createdAt: this.createdAt,
    };
};

module.exports = mongoose.model("User", userSchema);
