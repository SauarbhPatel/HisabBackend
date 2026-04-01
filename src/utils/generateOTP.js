const crypto = require("crypto");

/**
 * Generate a 6-digit numeric OTP
 */
const generateOTP = () => {
    // Cryptographically secure random 6-digit number
    const otp = crypto.randomInt(100000, 999999).toString();
    return otp;
};

/**
 * Send OTP — currently logs to console (mock).
 * Replace this with Twilio / MSG91 when ready.
 */
const sendOTP = async (phone, otp) => {
    if (process.env.NODE_ENV === "production") {
        // TODO: Integrate Twilio or MSG91 here
        // Example Twilio:
        // const twilio = require('twilio')(ACCOUNT_SID, AUTH_TOKEN);
        // await twilio.messages.create({ body: `Your Hisaab OTP is: ${otp}`, from: FROM_NUMBER, to: phone });
        console.log(`📱 [PROD] OTP ${otp} → ${phone}`);
    } else {
        // Development: log to console
        console.log(`\n📱 ━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`   OTP for ${phone}: ${otp}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }
    return true;
};

module.exports = { generateOTP, sendOTP };
