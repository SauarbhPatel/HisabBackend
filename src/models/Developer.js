const mongoose = require("mongoose");

const developerSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        name: {
            type: String,
            required: [true, "Developer name is required"],
            trim: true,
            maxlength: 60,
        },
        phone: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        upiId: { type: String, trim: true },
        role: { type: String, trim: true }, // default role e.g. "Frontend Developer"
        notes: { type: String, trim: true },

        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },

        // Aggregates (computed from Project records, cached here for listing)
        // These are updated via updateDevStats() helper called after project payments
        totalPaid: { type: Number, default: 0, min: 0 },
        totalPending: { type: Number, default: 0, min: 0 },
        projectCount: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true },
);

// ─── Compound index for faster listing queries ────────────────
developerSchema.index({ owner: 1, status: 1 });
developerSchema.index({ owner: 1, name: 1 });

module.exports = mongoose.model("Developer", developerSchema);
