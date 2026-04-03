const { verifyAccessToken } = require("../utils/jwt");
const User = require("../models/User");
const { sendError } = require("../utils/response");

// ─── Protect: require valid access token ─────────────────────
const protect = async (req, res, next) => {
    try {
        let token;

        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer ")
        ) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (!token)
            return sendError(res, "Not authorized. Please login first.", "401");

        let decoded;
        try {
            decoded = verifyAccessToken(token);
        } catch (err) {
            if (err.name === "TokenExpiredError")
                return sendError(
                    res,
                    "Access token expired. Please refresh.",
                    "401",
                );
            return sendError(res, "Invalid token. Please login again.", "401");
        }

        // Fetch user + tokenVersion to validate against logout
        const user = await User.findById(decoded.id).select("+tokenVersion");

        if (!user) return sendError(res, "Account no longer exists.", "401");
        if (!user.isActive)
            return sendError(
                res,
                "Account is deactivated. Contact support.",
                "401",
            );

        // ── Logout invalidation check ──────────────────────────────
        // If user logged out, tokenVersion was incremented.
        // Any token issued before logout carries the old version → reject it.
        if (decoded.tokenVersion !== user.tokenVersion)
            return sendError(
                res,
                "Session expired. Please login again.",
                "401",
            );

        req.user = user;
        next();
    } catch (err) {
        next(err);
    }
};

// ─── Require profile to be complete ──────────────────────────
const requireCompleteProfile = (req, res, next) => {
    if (!req.user.isProfileComplete)
        return sendError(
            res,
            "Please complete your profile setup first.",
            "403",
        );
    next();
};

module.exports = { protect, requireCompleteProfile };
