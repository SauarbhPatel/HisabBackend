const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");
const connectDB = require("./src/config/db");
const setupSwagger = require("./src/config/swagger");

dotenv.config();
connectDB();

const app = express();

// ─── CORS ────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : [
          "http://localhost:3000",
          "http://127.0.0.1:5500",
          "http://localhost:5000",
      ];

app.use(
    cors({
        origin: (origin, callback) => {
            console.log(origin, allowedOrigins);
            // Allow requests with no origin (mobile apps, Postman, curl)
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`CORS blocked: ${origin}`));
            }
        },
        credentials: true,
    }),
);

// ── Swagger Docs ───────────────────────────────────────────────────────────
setupSwagger(app);

// ─── Body Parser ─────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Global Rate Limiter (all routes) ────────────────────────
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            message: "Too many requests. Please slow down.",
        },
    }),
);

// ─── Strict Auth Rate Limiter (login/signup/otp) ─────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        message: "Too many auth attempts. Try again in 15 minutes.",
    },
});

// ─── Routes ──────────────────────────────────────────────────
app.use("/api/auth", authLimiter, require("./src/routes/authRoutes"));
app.use("/api/projects", require("./src/routes/projectRoutes"));
app.use("/api/developers", require("./src/routes/developerRoutes"));
app.use("/api/expenses", require("./src/routes/expenseRoutes"));
app.use("/api/friends", require("./src/routes/friendRoutes"));
app.use("/api/groups", require("./src/routes/groupRoutes"));
app.use("/api/dashboard", require("./src/routes/dashboardRoutes"));

// ─── Health Check ────────────────────────────────────────────
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "💸 Hisaab API is running",
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
});

// ─── 404 Handler ─────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

// ─── Global Error Handler ────────────────────────────────────
app.use((err, req, res, next) => {
    console.error("❌", err.message);

    // Mongoose validation error
    if (err.name === "ValidationError") {
        const messages = Object.values(err.errors).map((e) => e.message);
        return res
            .status(400)
            .json({ success: false, message: messages.join(". ") });
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res
            .status(409)
            .json({ success: false, message: `${field} is already in use.` });
    }

    // CORS error
    if (err.message && err.message.startsWith("CORS blocked")) {
        return res.status(403).json({ success: false, message: err.message });
    }

    res.status(err.status || 500).json({
        success: false,
        message:
            process.env.NODE_ENV === "production"
                ? "Something went wrong. Please try again."
                : err.message,
    });
});

// ─── Start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n✅ Hisaab server started`);
    console.log(`   Port : ${PORT}`);
    console.log(`   Mode : ${process.env.NODE_ENV}`);
    console.log(`   URL  : http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
