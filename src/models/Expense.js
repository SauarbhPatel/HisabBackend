const mongoose = require("mongoose");

const CATEGORIES = [
    "food",
    "travel",
    "bills",
    "entertainment",
    "shopping",
    "health",
    "education",
    "home",
    "family",
    "emi",
    "gifts",
    "drinks",
    "fuel",
    "trip",
    "miscellaneous",
    "other",
];

const expenseSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // Core
        amount: {
            type: Number,
            required: [true, "Amount is required"],
            min: [0.01, "Amount must be positive"],
        },
        category: { type: String, enum: CATEGORIES, default: "other" },
        description: { type: String, trim: true, maxlength: 200 },
        date: { type: Date, required: true, default: Date.now },

        // Payment
        paidVia: {
            type: String,
            enum: ["upi", "cash", "card", "bank", "other"],
            default: "cash",
        },

        // Split context (optional — links to a group or friend split)
        splitType: {
            type: String,
            enum: ["solo", "group", "friend"],
            default: "solo",
        },
        group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
        splitWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

        note: { type: String, trim: true },

        // Month key for fast monthly aggregation e.g. "2026-03"
        monthKey: { type: String, index: true },
    },
    { timestamps: true },
);

// ─── Auto-set monthKey ────────────────────────────────────────
expenseSchema.pre("save", function (next) {
    if (this.isModified("date") || !this.monthKey) {
        const d = this.date || new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        this.monthKey = `${y}-${m}`;
    }
    next();
});

// ─── Indexes ──────────────────────────────────────────────────
expenseSchema.index({ owner: 1, monthKey: -1 });
expenseSchema.index({ owner: 1, category: 1 });
expenseSchema.index({ owner: 1, date: -1 });

module.exports = mongoose.model("Expense", expenseSchema);
