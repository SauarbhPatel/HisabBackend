const mongoose = require("mongoose");

// ─── Sub-schema: Payment received from this client ───────────
const clientPaymentSchema = new mongoose.Schema(
    {
        label: { type: String, required: true, trim: true }, // "Advance Payment", "Milestone 2" etc.
        amount: { type: Number, required: true, min: 0 },
        date: { type: Date, required: true },
        method: {
            type: String,
            enum: ["upi", "bank", "cash", "cheque", "other"],
            default: "upi",
        },
        reference: { type: String, trim: true }, // UPI Ref / Txn ID
        note: { type: String, trim: true },
        status: {
            type: String,
            enum: ["paid", "pending", "due"],
            default: "paid",
        },
    },
    { timestamps: true },
);

// ─── Main Client Schema ───────────────────────────────────────
const clientSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // ── Company / client identity ────────────────────────────────
        name: {
            type: String,
            required: [true, "Client name is required"],
            trim: true,
            maxlength: 100,
        },
        contactPerson: { type: String, trim: true }, // "Rajesh M.", "Prashant K.", "Principal"
        phone: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        industry: {
            type: String,
            enum: [
                "Technology",
                "Education",
                "Real Estate",
                "Retail",
                "Finance",
                "Healthcare",
                "Other",
            ],
            default: "Other",
        },
        notes: { type: String, trim: true }, // "Referred by Rahul" etc.

        // ── Avatar / UI display ──────────────────────────────────────
        // Emoji icon shown in the list card (🟣 🟡 🟢 etc.)
        icon: { type: String, default: "🏢" },
        // Background colour for the avatar circle  e.g. "#EDE9FE"
        avatarColor: { type: String, default: "#E5E7EB" },

        // ── Status ───────────────────────────────────────────────────
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },

        // ── Standalone payment history (not tied to a specific project)
        // Payments that belong directly to a project are stored on
        // Project.clientPayments — these are standalone / direct receipts.
        payments: [clientPaymentSchema],

        // ── Cached aggregate totals (kept in sync by pre-save hook & updateClientStats helper) ─
        // totalBilled  = sum of totalPrice across all linked projects
        // totalReceived = sum of all received amounts across linked projects
        totalBilled: { type: Number, default: 0, min: 0 },
        totalReceived: { type: Number, default: 0, min: 0 },
        projectCount: { type: Number, default: 0, min: 0 },

        isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
);

// ─── Virtuals ─────────────────────────────────────────────────
clientSchema.virtual("totalPending").get(function () {
    return Math.max(0, this.totalBilled - this.totalReceived);
});

clientSchema.virtual("paymentPercent").get(function () {
    if (!this.totalBilled) return 0;
    return Math.round((this.totalReceived / this.totalBilled) * 100);
});

// ─── Indexes ─────────────────────────────────────────────────
clientSchema.index({ owner: 1, status: 1 });
clientSchema.index({ owner: 1, name: 1 });
clientSchema.index({ owner: 1, industry: 1 });

clientSchema.set("toJSON", { virtuals: true });
clientSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Client", clientSchema);
