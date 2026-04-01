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
            sparse: true, // allows null but enforces unique when set
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
            select: false, // never returned in queries by default
        },

        // Which login methods this user has set up
        authMethods: {
            phoneOtp: { type: Boolean, default: false },
            phonePassword: { type: Boolean, default: false },
            emailPassword: { type: Boolean, default: false },
        },

        isPhoneVerified: { type: Boolean, default: false },
        isEmailVerified: { type: Boolean, default: false },

        // ─── OTP (shared for phone-otp login & forgot-password) ───
        otp: {
            code: { type: String, select: false },
            expiresAt: { type: Date, select: false },
            attempts: { type: Number, default: 0, select: false },
            purpose: {
                type: String,
                enum: ["signup", "login", "reset"],
                select: false,
            },
        },

        // ─── Step 3: Profile ──────────────────────────────────────
        avatar: {
            type: String,
            enum: ["😎", "🧑‍💻", "👩‍💼", "🧑‍🎨", "👨‍🍳", "🦸"],
            default: "😎",
        },

        useCase: {
            type: String,
            enum: ["split", "freelance", "both"],
            default: "both",
        },

        // ─── Account State ────────────────────────────────────────
        isProfileComplete: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
        lastLogin: { type: Date },
    },
    { timestamps: true },
);

// ─── Normalize phone before save (ensure +91 prefix) ────────
userSchema.pre("save", function (next) {
    if (this.isModified("phone") && this.phone) {
        let p = this.phone.replace(/\s+/g, "");
        if (!p.startsWith("+")) {
            // strip leading 91 if present, then add +91
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
    // Skip hashing temp passwords
    if (this.password.startsWith("__TEMP__")) return next();
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// ─── Instance method: compare password ───────────────────────
userSchema.methods.comparePassword = async function (candidate) {
    return bcrypt.compare(candidate, this.password);
};

// ─── Instance method: safe public profile ────────────────────
userSchema.methods.toPublicJSON = function () {
    return {
        id: this._id,
        name: this.name,
        phone: this.phone || null,
        email: this.email || null,
        avatar: this.avatar,
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
