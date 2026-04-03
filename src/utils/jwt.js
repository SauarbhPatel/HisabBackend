const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendSuccess } = require("./response");

// ─── Sign SHORT-LIVED access token ───────────────────────────
// Payload includes tokenVersion so logout invalidates old tokens
const signAccessToken = (userId, tokenVersion) => {
    return jwt.sign({ id: userId, tokenVersion }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    });
};

// ─── Generate LONG-LIVED refresh token (random, then hashed on User) ─
// Returns the RAW token (sent to client) — caller saves hashed version to DB
const generateRefreshToken = () => {
    return crypto.randomBytes(64).toString("hex");
};

// ─── Verify access token ──────────────────────────────────────
const verifyAccessToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

// ─── Send both tokens as JSON response ───────────────────────
const sendTokenResponse = async (
    user,
    statusCode,
    res,
    message = "Success",
) => {
    // Reload tokenVersion (it may not be selected by default)
    const freshUser = await user.constructor
        .findById(user._id)
        .select("+tokenVersion");

    const tokenVersion = freshUser ? freshUser.tokenVersion : 0;
    const accessToken = signAccessToken(user._id, tokenVersion);
    const rawRefresh = generateRefreshToken();

    // Save hashed refresh token to DB
    user.refreshToken = rawRefresh; // pre-save hook hashes it
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    return sendSuccess(
        res,
        {
            accessToken,
            refreshToken: rawRefresh, // raw sent to client
            expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
            user: user.toPublicJSON(),
        },
        message,
    );
};

module.exports = {
    signAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    sendTokenResponse,
};
