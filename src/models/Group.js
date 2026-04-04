const mongoose = require("mongoose");

// ─── Category meta (matches expense categories + prototype icons) ─
const CATEGORY_ICONS = {
    food: "🍕",
    travel: "🚌",
    bills: "⚡",
    entertainment: "🎬",
    shopping: "🛒",
    health: "🏥",
    education: "📚",
    fashion: "👗",
    rent: "🏠",
    medical: "💊",
    gifts: "🎁",
    drinks: "🍺",
    fuel: "⛽",
    recharge: "📱",
    trip: "✈️",
    other: "➕",
};

const VALID_CATEGORIES = Object.keys(CATEGORY_ICONS);

// ─── Group expense entry ──────────────────────────────────────
const groupExpenseSchema = new mongoose.Schema(
    {
        description: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 0.01 },
        paidBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        date: { type: Date, default: Date.now },

        // Category — powers the expense icon in the group detail timeline
        category: {
            type: String,
            enum: VALID_CATEGORIES,
            default: "other",
        },

        splitType: {
            type: String,
            enum: ["equal", "percent", "custom"],
            default: "equal",
        },

        // Each member's share
        splits: [
            {
                member: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                name: { type: String }, // for non-app members
                share: { type: Number, required: true },
                percent: { type: Number }, // stored when splitType = 'percent'
                settled: { type: Boolean, default: false },
            },
        ],

        note: { type: String, trim: true },
    },
    { timestamps: true },
);

// ─── Group Schema ─────────────────────────────────────────────
const groupSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Group name is required"],
            trim: true,
            maxlength: 80,
        },
        icon: { type: String, default: "👥" },
        type: {
            type: String,
            enum: ["home", "trip", "work", "other"],
            default: "other",
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        members: [
            {
                user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                name: { type: String, trim: true }, // for non-app members
                phone: { type: String, trim: true },
                role: {
                    type: String,
                    enum: ["admin", "member"],
                    default: "member",
                },
                isAppUser: { type: Boolean, default: true },
                balance: { type: Number, default: 0 }, // net balance in this group
            },
        ],

        expenses: [groupExpenseSchema],

        // Cached totals — kept in sync by pre-save hook
        totalExpenses: { type: Number, default: 0 },

        // Cached last expense info — shown on group card ("Last: Electricity Bill · Mar 18")
        lastExpenseDesc: { type: String, default: "" },
        lastExpenseDate: { type: Date },

        isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
);

// ─── Auto-update totalExpenses + lastExpense on any change ────
groupSchema.pre("save", function (next) {
    if (this.isModified("expenses")) {
        // Recompute total from scratch (handles both add and delete)
        this.totalExpenses = this.expenses.reduce((s, e) => s + e.amount, 0);

        // Cache last expense for group card display
        if (this.expenses.length > 0) {
            const sorted = [...this.expenses].sort(
                (a, b) => new Date(b.date) - new Date(a.date),
            );
            this.lastExpenseDesc = sorted[0].description;
            this.lastExpenseDate = sorted[0].date;
        } else {
            this.lastExpenseDesc = "";
            this.lastExpenseDate = undefined;
        }
    }
    next();
});

// ─── Virtual: category icon helper ───────────────────────────
groupSchema.statics.categoryIcon = (cat) => CATEGORY_ICONS[cat] || "➕";

// ─── Index: fast lookup by member ────────────────────────────
groupSchema.index({ "members.user": 1 });

module.exports = mongoose.model("Group", groupSchema);
module.exports.CATEGORY_ICONS = CATEGORY_ICONS;
