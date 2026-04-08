const mongoose = require("mongoose");

// ─── Sub-schema: Client Payment Entry ────────────────────────
const clientPaymentSchema = new mongoose.Schema(
    {
        label: { type: String, required: true, trim: true }, // "Advance Payment", "Second Installment", "Final Payment"
        amount: { type: Number, required: true, min: 0 },
        date: { type: Date, required: true },
        method: {
            type: String,
            enum: ["upi", "cash", "bank", "cheque", "other"],
            default: "upi",
        },
        reference: { type: String, trim: true }, // UPI Ref / NEFT Txn ID
        note: { type: String, trim: true },
        status: {
            type: String,
            enum: ["paid", "pending", "due"], // paid ✅  |  pending ⏳  |  due ⚠️ (overdue)
            default: "paid",
        },
    },
    { timestamps: true },
);

// ─── Sub-schema: Single payment made to a developer on this project ──
const devPaymentSchema = new mongoose.Schema(
    {
        amount: { type: Number, required: true, min: 0 },
        date: { type: Date, required: true, default: Date.now },
        method: {
            type: String,
            enum: ["upi", "cash", "bank", "other"], // UPI/PhonePe/GPay | Cash | Bank Transfer
            default: "upi",
        },
        note: { type: String, trim: true },
    },
    { timestamps: true },
);

// ─── Sub-schema: Developer assigned to this project ──────────
const projectDevSchema = new mongoose.Schema(
    {
        developer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Developer",
            required: true,
        },
        role: { type: String, trim: true }, // role on THIS project (may differ from default)
        agreedAmount: { type: Number, required: true, min: 0 },
        paidAmount: { type: Number, default: 0, min: 0 }, // updated by pre-save hook from payments[]
        status: {
            type: String,
            enum: ["active", "paused", "removed"], // ● Active | ⏸ Paused | removed
            default: "active",
        },
        payments: [devPaymentSchema], // individual payment instalments
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

        // ── Basic Info ───────────────────────────────────────────────
        name: {
            type: String,
            required: [true, "Project name is required"],
            trim: true,
            maxlength: 100,
        },
        type: {
            type: String,
            trim: true,
            // enum: [
            //     "Development",
            //     "UI/UX Design",
            //     "Deployment",
            //     "Maintenance",
            //     "Mobile App",
            //     "Web App",
            //     "API Integration",
            //     "Other",
            // ],
            default: "Development",
        },
        client: {
            type: String,
            required: [true, "Client name is required"],
            trim: true,
        },
        startDate: { type: Date, required: [true, "Start date is required"] },
        endDate: { type: Date },
        notes: { type: String, trim: true }, // internal notes about the project
        tags: [{ type: String, trim: true }], // custom labels e.g. ["urgent", "retainer"]

        // ── Financials ───────────────────────────────────────────────
        totalPrice: {
            type: Number,
            required: [true, "Project price is required"],
            min: 0,
        },
        receivedAmount: { type: Number, default: 0, min: 0 }, // auto-computed from paid clientPayments

        // ── Status ───────────────────────────────────────────────────
        // Matches the Status Overlay options exactly
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

        // ── Client Payment Timeline ──────────────────────────────────
        clientPayments: [clientPaymentSchema],

        // ── Developer Assignments ────────────────────────────────────
        developers: [projectDevSchema],

        // ── Invoice reference (🧾 Invoice button in UI) ──────────────
        invoiceUrl: { type: String, trim: true }, // optional URL to generated invoice PDF
        invoiceNumber: { type: String, trim: true }, // e.g. "INV-2026-001"

        isArchived: { type: Boolean, default: false },
    },
    { timestamps: true },
);

// ─── Virtual: pending amount from client ─────────────────────
projectSchema.virtual("pendingAmount").get(function () {
    return Math.max(0, this.totalPrice - this.receivedAmount);
});

// ─── Virtual: payment percentage ─────────────────────────────
projectSchema.virtual("paymentPercent").get(function () {
    if (!this.totalPrice) return 0;
    return Math.round((this.receivedAmount / this.totalPrice) * 100);
});

// ─── Virtual: total dev pay agreed ───────────────────────────
projectSchema.virtual("totalDevAgreed").get(function () {
    return this.developers.reduce((s, d) => s + (d.agreedAmount || 0), 0);
});

// ─── Virtual: total dev pay disbursed ────────────────────────
projectSchema.virtual("totalDevPaid").get(function () {
    return this.developers.reduce((s, d) => s + (d.paidAmount || 0), 0);
});

// ─── Virtual: profit = received − dev paid ───────────────────
projectSchema.virtual("profit").get(function () {
    return this.receivedAmount - this.totalDevPaid;
});

// ─── Pre-save hook: sync receivedAmount & each dev's paidAmount ──
projectSchema.pre("save", function (next) {
    // Recompute receivedAmount from clientPayments where status === 'paid'
    if (this.isModified("clientPayments")) {
        this.receivedAmount = this.clientPayments
            .filter((p) => p.status === "paid")
            .reduce((s, p) => s + p.amount, 0);
    }

    // Recompute each dev slot's paidAmount from their payments array
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

// ─── Indexes ─────────────────────────────────────────────────
projectSchema.index({ owner: 1, status: 1 });
projectSchema.index({ owner: 1, client: 1 });
projectSchema.index({ owner: 1, startDate: -1 });
projectSchema.index({ owner: 1, isArchived: 1 });

projectSchema.set("toJSON", { virtuals: true });
projectSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Project", projectSchema);
