const crypto = require('crypto');

// ─── Generate cryptographically secure 6-digit OTP ───────────
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// ─── Mock OTP sender (logs to console) ───────────────────────
// To switch to real SMS later, replace the body of sendOTP.
// Supported providers to add: MSG91, Twilio, Fast2SMS
const sendOTP = async (phone, otp, purpose = 'signup') => {
  const purposeLabels = {
    signup: 'Signup Verification',
    login:  'Login OTP',
    reset:  'Password Reset',
  };

  const label = purposeLabels[purpose] || 'OTP';

  if (process.env.NODE_ENV === 'production') {
    // ── PRODUCTION: plug in your SMS provider here ──
    // Example MSG91:
    // const axios = require('axios');
    // await axios.get(
    //   `https://api.msg91.com/api/sendotp.php?template_id=...&mobile=${phone}&authkey=...&otp=${otp}`
    // );
    //
    // Example Twilio:
    // const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    // await twilio.messages.create({
    //   body: `[Hisaab] Your ${label} OTP is: ${otp}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} mins.`,
    //   from: process.env.TWILIO_FROM,
    //   to: phone,
    // });

    console.log(`📱 [PROD-MOCK] ${label} OTP for ${phone}: ${otp}`);
  } else {
    // ── DEVELOPMENT: pretty console log ──
    console.log('\n' + '─'.repeat(45));
    console.log(`  📱 MOCK SMS → ${phone}`);
    console.log(`  Purpose  : ${label}`);
    console.log(`  OTP Code : ${otp}`);
    console.log(`  Expires  : ${process.env.OTP_EXPIRY_MINUTES || 10} minutes`);
    console.log('─'.repeat(45) + '\n');
  }

  return true;
};

// ─── Build OTP payload for storing in DB ─────────────────────
const buildOTPPayload = (otp, purpose) => ({
  code:      otp,
  expiresAt: new Date(Date.now() + (Number(process.env.OTP_EXPIRY_MINUTES) || 10) * 60 * 1000),
  attempts:  0,
  purpose,
});

module.exports = { generateOTP, sendOTP, buildOTPPayload };
