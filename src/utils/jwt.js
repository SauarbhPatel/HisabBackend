const jwt = require('jsonwebtoken');

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
  res.status(statusCode).json({
    success: true,
    message,
    token,
    user: user.toPublicJSON(),
  });
};

module.exports = { signToken, sendTokenResponse };
