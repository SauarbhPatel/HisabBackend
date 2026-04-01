const validator = require('validator');

// ─── Indian phone: 10 digits, starts with 6-9, optional +91 ──
const isValidPhone = (phone) => {
  const stripped = phone.replace(/\s+/g, '').replace(/^\+?91/, '');
  return /^[6-9]\d{9}$/.test(stripped);
};

const isValidEmail = (email) => {
  return validator.isEmail(email);
};

const isValidPassword = (password) => {
  // Min 8 chars, at least 1 letter and 1 number
  return (
    password.length >= 8 &&
    /[a-zA-Z]/.test(password) &&
    /\d/.test(password)
  );
};

// Detect whether a string looks like a phone or email
const detectIdentifierType = (identifier) => {
  const stripped = identifier.replace(/\s+/g, '');
  if (isValidPhone(stripped) || stripped.startsWith('+91')) return 'phone';
  if (isValidEmail(stripped)) return 'email';
  return null;
};

module.exports = { isValidPhone, isValidEmail, isValidPassword, detectIdentifierType };
