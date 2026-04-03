const validator = require("validator");

// ─── Indian phone: 10 digits, starts with 6-9, optional +91 ──
const isValidPhone = (phone) => {
    const stripped = phone.replace(/\s+/g, "").replace(/^\+?91/, "");
    return /^[6-9]\d{9}$/.test(stripped);
};

// ─── Fully normalize to +91XXXXXXXXXX (exact DB format) ──────
// Used for all DB lookups to ensure exact match, not partial regex
const normalizePhone = (phone) => {
    let p = phone.replace(/\s+/g, "");
    // Strip leading + if present
    if (p.startsWith("+91")) return p;
    if (p.startsWith("91") && p.length === 12) return "+" + p;
    // Plain 10-digit number
    return "+91" + p.replace(/^91/, "");
};

const isValidEmail = (email) => {
    return validator.isEmail(email);
};

const isValidPassword = (password) => {
    return (
        password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password)
    );
};

// Detect whether a string looks like a phone or email
const detectIdentifierType = (identifier) => {
    const stripped = identifier.replace(/\s+/g, "");
    // Check email first — prevents digit-heavy emails from matching phone
    if (isValidEmail(stripped)) return "email";
    if (isValidPhone(stripped) || /^\+?91\d{10}$/.test(stripped))
        return "phone";
    return null;
};

module.exports = {
    isValidPhone,
    normalizePhone,
    isValidEmail,
    isValidPassword,
    detectIdentifierType,
};
