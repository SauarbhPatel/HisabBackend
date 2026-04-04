const Friend = require("../models/Friend");
const { sendSuccess, sendError } = require("../utils/response");

const VALID_METHODS = ["upi", "cash", "bank", "other"];

// ═══════════════════════════════════════════════════════════════
// GET /api/friends
// Query: ?filter=owe|owed|settled&search=Priya
// Powers: Friends list screen with balance stats + filter chips
// ═══════════════════════════════════════════════════════════════
exports.getFriends = async (req, res, next) => {
    try {
        const { filter, search } = req.query;

        const query = { owner: req.user.id, isActive: true };

        // ── Filter chips: All / You Owe / Owed to You / Settled ───
        if (filter === "owe") query.balance = { $lt: -0.005 }; // you owe friend
        if (filter === "owed") query.balance = { $gt: 0.005 }; // friend owes you
        if (filter === "settled") query.balance = { $gte: -0.005, $lte: 0.005 }; // ~zero

        // ── Search bar on friends screen ──────────────────────────
        if (search) {
            query.$or = [
                { friendName: { $regex: search, $options: "i" } },
                { nickName: { $regex: search, $options: "i" } },
                { friendPhone: { $regex: search, $options: "i" } },
                { friendEmail: { $regex: search, $options: "i" } },
            ];
        }

        const friends = await Friend.find(query)
            .populate("friend", "name phone avatar avatarColor")
            .sort({ lastTransactionDate: -1, updatedAt: -1 });

        // ── Summary stats shown at top of friends screen ──────────
        const allFriends = await Friend.find({
            owner: req.user.id,
            isActive: true,
        }).select("balance");

        const totalOwedToYou = allFriends
            .filter((f) => f.balance > 0.005)
            .reduce((s, f) => s + f.balance, 0);

        const totalYouOwe = allFriends
            .filter((f) => f.balance < -0.005)
            .reduce((s, f) => s + Math.abs(f.balance), 0);

        return sendSuccess(
            res,
            {
                count: friends.length,
                stats: {
                    totalOwedToYou: +totalOwedToYou.toFixed(2),
                    totalYouOwe: +totalYouOwe.toFixed(2),
                    netBalance: +(totalOwedToYou - totalYouOwe).toFixed(2),
                    friendCount: allFriends.length,
                },
                friends,
            },
            "Friends fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// GET /api/friends/:id
// Powers: Friend Detail overlay (OkCredit style)
// Returns: friend info + full transaction history (newest first)
// ═══════════════════════════════════════════════════════════════
exports.getFriend = async (req, res, next) => {
    try {
        const friend = await Friend.findOne({
            _id: req.params.id,
            owner: req.user.id,
        }).populate("friend", "name phone avatar avatarColor email");

        if (!friend) return sendError(res, "Friend not found.", "404");

        // Sort transactions newest first for the OkCredit-style timeline
        friend.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        return sendSuccess(res, { friend }, "Friend fetched successfully.");
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// POST /api/friends
// Powers: Add Friend overlay
// Body: { friendName, friendPhone?, friendEmail?, nickName?, avatarColor? }
//    OR { friend: userId } for app users
// ═══════════════════════════════════════════════════════════════
exports.addFriend = async (req, res, next) => {
    try {
        const {
            friend,
            friendName,
            friendPhone,
            friendEmail,
            nickName,
            avatarColor,
        } = req.body;

        if (!friend && !friendName)
            return sendError(
                res,
                "friendName (or friend userId) is required.",
                "400",
            );

        // Prevent adding yourself
        if (friend && friend === req.user.id.toString())
            return sendError(
                res,
                "You cannot add yourself as a friend.",
                "400",
            );

        // Duplicate checks
        if (friend) {
            const exists = await Friend.findOne({ owner: req.user.id, friend });
            if (exists)
                return sendError(res, "This friend is already added.", "409");
        }
        if (friendPhone) {
            const exists = await Friend.findOne({
                owner: req.user.id,
                friendPhone,
            });
            if (exists)
                return sendError(
                    res,
                    "A friend with this phone is already added.",
                    "409",
                );
        }

        const newFriend = await Friend.create({
            owner: req.user.id,
            friend: friend || undefined,
            friendName: friendName || undefined,
            friendPhone: friendPhone || undefined,
            friendEmail: friendEmail || undefined,
            nickName: nickName || undefined,
            avatarColor: avatarColor || "#1a7a5e",
        });

        return sendSuccess(
            res,
            { friend: newFriend },
            "Friend added successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// PATCH /api/friends/:id
// Powers: Edit friend — avatar color picker, nickName, phone update
// Body: { friendName?, nickName?, friendPhone?, friendEmail?, avatarColor? }
// ═══════════════════════════════════════════════════════════════
exports.updateFriend = async (req, res, next) => {
    try {
        const allowed = [
            "friendName",
            "nickName",
            "friendPhone",
            "friendEmail",
            "avatarColor",
        ];
        const updates = {};
        allowed.forEach((k) => {
            if (req.body[k] !== undefined) updates[k] = req.body[k];
        });

        if (!Object.keys(updates).length)
            return sendError(res, "No valid fields provided to update.", "400");

        if (updates.friendEmail)
            updates.friendEmail = updates.friendEmail.toLowerCase();
        if (updates.friendName) updates.friendName = updates.friendName.trim();
        if (updates.nickName) updates.nickName = updates.nickName.trim();

        // Check phone not already used by another friend
        if (updates.friendPhone) {
            const conflict = await Friend.findOne({
                owner: req.user.id,
                friendPhone: updates.friendPhone,
                _id: { $ne: req.params.id },
            });
            if (conflict)
                return sendError(
                    res,
                    "Another friend with this phone already exists.",
                    "409",
                );
        }

        const friend = await Friend.findOneAndUpdate(
            { _id: req.params.id, owner: req.user.id },
            { $set: updates },
            { new: true, runValidators: true },
        ).populate("friend", "name phone avatar");

        if (!friend) return sendError(res, "Friend not found.", "404");

        return sendSuccess(res, { friend }, "Friend updated successfully.");
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// POST /api/friends/:id/transactions
// Powers: "You Gave" and "You Received" forms in Friend Detail overlay
// Body: { direction, amount, note?, date?, method? }
// ═══════════════════════════════════════════════════════════════
exports.addTransaction = async (req, res, next) => {
    try {
        const { direction, amount, note, date, method } = req.body;

        if (!direction || !["gave", "received"].includes(direction))
            return sendError(
                res,
                "direction must be 'gave' or 'received'.",
                "400",
            );

        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
            return sendError(res, "Valid positive amount is required.", "400");

        // ── FIX: validate method enum ─────────────────────────────
        if (method && !VALID_METHODS.includes(method))
            return sendError(
                res,
                `Invalid method. Valid: ${VALID_METHODS.join(", ")}`,
                "400",
            );

        const friendDoc = await Friend.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!friendDoc) return sendError(res, "Friend not found.", "404");

        friendDoc.transactions.push({
            direction,
            amount: +Number(amount).toFixed(2),
            note: note || "",
            date: date ? new Date(date) : new Date(),
            method: method || "cash",
        });

        await friendDoc.save(); // pre-save hook recalculates balance, expenseCount, lastTransactionDate

        const newTx = friendDoc.transactions[friendDoc.transactions.length - 1];

        return sendSuccess(
            res,
            {
                balance: friendDoc.balance,
                expenseCount: friendDoc.expenseCount,
                transaction: newTx,
            },
            direction === "gave"
                ? "Recorded — You gave money."
                : "Recorded — You received money.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// DELETE /api/friends/:id/transactions/:txId
// Powers: Deleting an individual transaction entry
// ═══════════════════════════════════════════════════════════════
exports.deleteTransaction = async (req, res, next) => {
    try {
        const friendDoc = await Friend.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!friendDoc) return sendError(res, "Friend not found.", "404");

        // ── FIX: verify transaction exists before pulling ─────────
        const txExists = friendDoc.transactions.id(req.params.txId);
        if (!txExists) return sendError(res, "Transaction not found.", "404");

        friendDoc.transactions.pull({ _id: req.params.txId });
        await friendDoc.save(); // pre-save hook recalculates balance + expenseCount

        return sendSuccess(
            res,
            {
                balance: friendDoc.balance,
                expenseCount: friendDoc.expenseCount,
            },
            "Transaction deleted.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// POST /api/friends/:id/settle
// Powers: "Settle Up" button / overlay
// Records one final transaction that zeros out the balance
// Body: { method?, note? }
// ═══════════════════════════════════════════════════════════════
exports.settleUp = async (req, res, next) => {
    try {
        const { method, note } = req.body;

        if (method && !VALID_METHODS.includes(method))
            return sendError(
                res,
                `Invalid method. Valid: ${VALID_METHODS.join(", ")}`,
                "400",
            );

        const friendDoc = await Friend.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!friendDoc) return sendError(res, "Friend not found.", "404");

        if (Math.abs(friendDoc.balance) < 0.005)
            return sendError(res, "Already settled. Balance is ₹0.", "400");

        const settleAmount = +Math.abs(friendDoc.balance).toFixed(2);

        // ── FIX: correct direction logic ─────────────────────────
        // balance > 0  → friend owes you → they are paying you → direction = 'received'
        // balance < 0  → you owe friend  → you are paying them → direction = 'gave'
        const direction = friendDoc.balance > 0 ? "received" : "gave";

        friendDoc.transactions.push({
            direction,
            amount: settleAmount,
            note: note || "Settlement",
            date: new Date(),
            method: method || "upi",
        });

        await friendDoc.save(); // pre-save hook → balance becomes 0

        return sendSuccess(
            res,
            {
                balance: friendDoc.balance, // should be 0 (or near 0)
                expenseCount: friendDoc.expenseCount,
                settledAmount: settleAmount,
                direction,
            },
            "Settled successfully! Balance is now ₹0.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// DELETE /api/friends/:id
// Powers: Remove friend button
// Blocked if there is an unsettled balance
// ═══════════════════════════════════════════════════════════════
exports.deleteFriend = async (req, res, next) => {
    try {
        const friendDoc = await Friend.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!friendDoc) return sendError(res, "Friend not found.", "404");

        if (Math.abs(friendDoc.balance) > 0.005)
            return sendError(
                res,
                `Cannot remove — unsettled balance of ₹${Math.abs(friendDoc.balance).toFixed(2)}. Settle up first.`,
                "400",
            );

        await friendDoc.deleteOne();
        return sendSuccess(res, null, "Friend removed successfully.");
    } catch (err) {
        next(err);
    }
};
