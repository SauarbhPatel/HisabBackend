const mongoose = require("mongoose");

// ─── Sub-schema: Client Payment Entry ────────────────────────
const clientPaymentSchema = new mongoose.Schema(
    {
        label: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 0 },
        date: { type: Date, required: true },
        method: {
            type: String,
            enum: ["upi", "cash", "bank", "cheque", "other"],
            default: "upi",
        },
        reference: { type: String, trim: true }, // UPI ref / txn ID
        note: { type: String, trim: true },
        status: {
            type: String,
            enum: ["paid", "pending", "due"],
            default: "pending",
        },
    },
    { timestamps: true },
);

// ─── Sub-schema: Developer on a Project ──────────────────────
const projectDevSchema = new mongoose.Schema(
    {
        developer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Developer",
            required: true,
        },
        role: { type: String, trim: true }, // role on THIS project
        agreedAmount: { type: Number, required: true, min: 0 },
        paidAmount: { type: Number, default: 0, min: 0 },
        status: {
            type: String,
            enum: ["active", "paused", "removed"],
            default: "active",
        },
        // Payment history for this dev on this project
        payments: [
            {
                amount: { type: Number, required: true, min: 0 },
                date: { type: Date, required: true },
                method: {
                    type: String,
                    enum: ["upi", "cash", "bank", "other"],
                    default: "upi",
                },
                note: { type: String, trim: true },
            },
        ],
    },
    { _id: true },
);

// ─── Main Project Schema ──────────────────────────────────────
const projectSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // Basic info
        name: {
            type: String,
            required: [true, "Project name is required"],
            trim: true,
            maxlength: 100,
        },
        type: { type: String, trim: true, default: "Development" }, // Development, UI/UX, etc.
        client: {
            type: String,
            required: [true, "Client name is required"],
            trim: true,
        },
        startDate: { type: Date, required: [true, "Start date is required"] },
        endDate: { type: Date },

        // Financials
        totalPrice: {
            type: Number,
            required: [true, "Project price is required"],
            min: 0,
        },
        receivedAmount: { type: Number, default: 0, min: 0 },

        // Status
        status: {
            type: String,
            enum: [
                "inactive",
                "inprogress",
                "onstay",
                "completed",
                "cancelled",
            ],
            default: "inprogress",
        },

        // Client payment timeline
        clientPayments: [clientPaymentSchema],

        // Developers assigned
        developers: [projectDevSchema],

        // Tags / labels
        tags: [{ type: String, trim: true }],

        isArchived: { type: Boolean, default: false },
    },
    { timestamps: true },
);

// ─── Virtual: pending amount from client ─────────────────────
projectSchema.virtual("pendingAmount").get(function () {
    return Math.max(0, this.totalPrice - this.receivedAmount);
});

// ─── Virtual: payment % ──────────────────────────────────────
projectSchema.virtual("paymentPercent").get(function () {
    if (!this.totalPrice) return 0;
    return Math.round((this.receivedAmount / this.totalPrice) * 100);
});

// ─── Auto-update receivedAmount when clientPayments change ───
projectSchema.pre("save", function (next) {
    if (this.isModified("clientPayments")) {
        this.receivedAmount = this.clientPayments
            .filter((p) => p.status === "paid")
            .reduce((sum, p) => sum + p.amount, 0);
    }
    // Auto-update each dev's paidAmount
    if (this.isModified("developers")) {
        this.developers.forEach((dev) => {
            dev.paidAmount = (dev.payments || []).reduce(
                (s, p) => s + p.amount,
                0,
            );
        });
    }
    next();
});

projectSchema.set("toJSON", { virtuals: true });
projectSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Project", projectSchema);
