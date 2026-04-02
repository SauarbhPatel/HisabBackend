const jwt = require('jsonwebtoken');
const { sendSuccess } = require('./response');

// ─── Sign a JWT for a user ────────────────────────────────────
const signToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// ─── Send token + user as JSON response ──────────────────────
const sendTokenResponse = (user, statusCode, res, message = 'Success') => {
  const token = signToken(user._id);
  return sendSuccess(res, { token, user: user.toPublicJSON() }, message);
};

module.exports = { signToken, sendTokenResponse };
