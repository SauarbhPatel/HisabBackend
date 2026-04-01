const mongoose = require("mongoose");

// ─── Individual transaction between two users ─────────────────
const txSchema = new mongoose.Schema(
    {
        direction: {
            type: String,
            enum: ["gave", "received"], // from the owner's perspective
            required: true,
        },
        amount: { type: Number, required: true, min: 0.01 },
        note: { type: String, trim: true },
        date: { type: Date, default: Date.now },
        method: {
            type: String,
            enum: ["upi", "cash", "bank", "other"],
            default: "cash",
        },
    },
    { timestamps: true },
);

// ─── Friend connection (one doc per pair, owned by initiator) ─
const friendSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        friend: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

        // For friends not yet on the app
        friendName: { type: String, trim: true },
        friendPhone: { type: String, trim: true },
        friendEmail: { type: String, trim: true, lowercase: true },
        nickName: { type: String, trim: true },
        avatarColor: { type: String, default: "#1a7a5e" },

        // Running balance (positive = friend owes owner, negative = owner owes friend)
        balance: { type: Number, default: 0 },

        transactions: [txSchema],

        isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
);

// ─── Prevent duplicate friend pairs ──────────────────────────
friendSchema.index({ owner: 1, friend: 1 }, { unique: true, sparse: true });
friendSchema.index({ owner: 1, friendPhone: 1 }, { sparse: true });

// ─── Recompute balance after each save ───────────────────────
friendSchema.pre("save", function (next) {
    if (this.isModified("transactions")) {
        this.balance = this.transactions.reduce((sum, tx) => {
            return tx.direction === "received"
                ? sum + tx.amount
                : sum - tx.amount;
        }, 0);
    }
    next();
});

module.exports = mongoose.model("Friend", friendSchema);
