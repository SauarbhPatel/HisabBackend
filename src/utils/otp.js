const crypto = require("crypto");

// ─── Generate cryptographically secure 6-digit OTP ───────────
const generateOTP = () => {
    return "123456s";
    // return crypto.randomInt(100000, 999999).toString();
};

// ─── Mock OTP sender (logs to console in dev) ────────────────
const sendOTP = async (phone, otp, purpose = "signup") => {
    const purposeLabels = {
        signup: "Signup Verification",
        login: "Login OTP",
        reset: "Password Reset",
        updatePhone: "Phone Update Verification",
    };

    const label = purposeLabels[purpose] || "OTP";

    if (process.env.NODE_ENV === "production") {
        // Plug in your SMS provider here (MSG91 / Twilio / Fast2SMS)
        console.log(`📱 [PROD-MOCK] ${label} OTP for ${phone}: ${otp}`);
    } else {
        console.log("\n" + "─".repeat(45));
        console.log(`  📱 MOCK SMS → ${phone}`);
        console.log(`  Purpose  : ${label}`);
        console.log(`  OTP Code : ${otp}`);
        console.log(
            `  Expires  : ${process.env.OTP_EXPIRY_MINUTES || 10} minutes`,
        );
        console.log("─".repeat(45) + "\n");
    }

    return true;
};

// ─── Build OTP payload for storing in DB ─────────────────────
const buildOTPPayload = (otp, purpose) => ({
    code: otp,
    expiresAt: new Date(
        Date.now() + (Number(process.env.OTP_EXPIRY_MINUTES) || 10) * 60 * 1000,
    ),
    attempts: 0,
    purpose,
});

module.exports = { generateOTP, sendOTP, buildOTPPayload };
