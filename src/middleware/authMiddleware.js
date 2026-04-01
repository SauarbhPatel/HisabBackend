const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized. Please login first.',
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please login again.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.',
        code: 'TOKEN_INVALID',
      });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Account no longer exists.' });
    }
    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is deactivated. Contact support.' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

// ─── Require profile to be complete ──────────────────────────
const requireCompleteProfile = (req, res, next) => {
  if (!req.user.isProfileComplete) {
    return res.status(403).json({
      success: false,
      message: 'Please complete your profile setup first.',
      code: 'PROFILE_INCOMPLETE',
    });
  }
  next();
};

module.exports = { protect, requireCompleteProfile };
