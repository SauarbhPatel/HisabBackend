const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendError } = require('../utils/response');

// ─── Protect: require valid JWT ───────────────────────────────
const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token)
      return sendError(res, 'Not authorized. Please login first.', '401');

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError')
        return sendError(res, 'Session expired. Please login again.', '401');
      return sendError(res, 'Invalid token. Please login again.', '401');
    }

    const user = await User.findById(decoded.id);

    if (!user)
      return sendError(res, 'Account no longer exists.', '401');
    if (!user.isActive)
      return sendError(res, 'Account is deactivated. Contact support.', '401');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

// ─── Require profile to be complete ──────────────────────────
const requireCompleteProfile = (req, res, next) => {
  if (!req.user.isProfileComplete)
    return sendError(res, 'Please complete your profile setup first.', '403');
  next();
};

module.exports = { protect, requireCompleteProfile };
