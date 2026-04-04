const mongoose = require("mongoose");

// ─── Individual transaction between two users ─────────────────
const txSchema = new mongoose.Schema(
    {
        direction: {
            type: String,
            enum: ["gave", "received"], // from the OWNER's perspective
            // 'gave'     → you paid the friend  → balance goes down (you owe more / they owe less)
            // 'received' → friend paid you      → balance goes up   (they owe you more / you owe less)
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

        // If the friend is also an app user
        friend: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

        // For friends not yet on the app
        friendName: { type: String, trim: true },
        friendPhone: { type: String, trim: true },
        friendEmail: { type: String, trim: true, lowercase: true },
        nickName: { type: String, trim: true },
        avatarColor: { type: String, default: "#1a7a5e" },

        // Running balance
        // positive → friend owes owner (shown GREEN in UI — "Owes you ₹X")
        // negative → owner owes friend (shown RED  in UI — "You owe ₹X")
        balance: { type: Number, default: 0 },

        // Cached count of transactions — shown on friend card as "N expenses"
        expenseCount: { type: Number, default: 0, min: 0 },

        // Date of the most recent transaction — useful for sorting / "last activity"
        lastTransactionDate: { type: Date },

        transactions: [txSchema],

        isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
);

// ─── Prevent duplicate friend pairs ──────────────────────────
friendSchema.index({ owner: 1, friend: 1 }, { unique: true, sparse: true });
friendSchema.index({ owner: 1, friendPhone: 1 }, { sparse: true });

// ─── Recompute balance + expenseCount + lastTransactionDate ───
// Runs every time transactions array is modified.
friendSchema.pre("save", function (next) {
    if (this.isModified("transactions")) {
        this.balance = this.transactions.reduce((sum, tx) => {
            return tx.direction === "received"
                ? sum + tx.amount // friend paid you → you are owed more
                : sum - tx.amount; // you paid friend → you owe more (or they owe less)
        }, 0);

        // Round to 2 decimal places to avoid floating-point drift
        this.balance = +this.balance.toFixed(2);

        this.expenseCount = this.transactions.length;

        // Latest transaction date (transactions are not guaranteed to be sorted)
        if (this.transactions.length > 0) {
            this.lastTransactionDate = this.transactions.reduce(
                (latest, tx) => {
                    const d = tx.date || tx.createdAt;
                    return d > latest ? d : latest;
                },
                new Date(0),
            );
        } else {
            this.lastTransactionDate = undefined;
        }
    }
    next();
});

module.exports = mongoose.model("Friend", friendSchema);
