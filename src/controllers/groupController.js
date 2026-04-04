const Group = require("../models/Group");
const { CATEGORY_ICONS } = require("../models/Group");
const { sendSuccess, sendError } = require("../utils/response");

const VALID_CATEGORIES = Object.keys(CATEGORY_ICONS);
const VALID_SPLIT_TYPES = ["equal", "percent", "custom"];

// ─── Helper: get current monthKey ────────────────────────────
const currentMonthKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

// ─── Helper: check if a date is in a given YYYY-MM key ───────
const inMonth = (date, monthKey) => {
    const d = new Date(date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return key === monthKey;
};

// ═══════════════════════════════════════════════════════════════
// GET /api/groups
// Powers: Groups list screen — group cards with balance badges,
//         last expense info, and this-month expense count
// ═══════════════════════════════════════════════════════════════
exports.getGroups = async (req, res, next) => {
    try {
        const groups = await Group.find({
            "members.user": req.user.id,
            isActive: true,
        })
            .populate("members.user", "name phone avatar")
            .sort({ updatedAt: -1 });

        const monthKey = currentMonthKey();

        const enriched = groups.map((g) => {
            // My balance in this group
            const me = g.members.find(
                (m) => m.user?._id?.toString() === req.user.id.toString(),
            );
            const myBalance = me ? +me.balance.toFixed(2) : 0;

            // Balance badge type: owe / lent / settled
            let balanceType = "settled";
            if (myBalance < -0.005) balanceType = "owe";
            else if (myBalance > 0.005) balanceType = "lent";

            // Expense count for current month
            const thisMonthCount = g.expenses.filter((e) =>
                inMonth(e.date, monthKey),
            ).length;

            return {
                _id: g._id,
                name: g.name,
                icon: g.icon,
                type: g.type,
                memberCount: g.members.length,
                members: g.members,
                totalExpenses: +g.totalExpenses.toFixed(2),
                lastExpenseDesc: g.lastExpenseDesc || "",
                lastExpenseDate: g.lastExpenseDate || null,
                thisMonthCount,
                myBalance,
                balanceType,
                isActive: g.isActive,
                createdAt: g.createdAt,
                updatedAt: g.updatedAt,
            };
        });

        return sendSuccess(
            res,
            {
                count: groups.length,
                groups: enriched,
            },
            "Groups fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// GET /api/groups/:id
// Powers: Group Detail overlay
// Returns: full group with member balances + expense timeline
// ═══════════════════════════════════════════════════════════════
exports.getGroup = async (req, res, next) => {
    try {
        const group = await Group.findById(req.params.id)
            .populate("members.user", "name phone avatar")
            .populate("expenses.paidBy", "name avatar");

        if (!group) return sendError(res, "Group not found.", "404");

        const isMember = group.members.some(
            (m) => m.user?._id?.toString() === req.user.id.toString(),
        );
        if (!isMember)
            return sendError(res, "Not a member of this group.", "403");

        // Sort expenses newest first for the timeline
        const sortedExpenses = [...group.toObject().expenses].sort(
            (a, b) => new Date(b.date) - new Date(a.date),
        );

        // Add icon to each expense for the UI
        sortedExpenses.forEach((e) => {
            e.icon = CATEGORY_ICONS[e.category] || "➕";
        });

        // My balance in this group
        const me = group.members.find(
            (m) => m.user?._id?.toString() === req.user.id.toString(),
        );
        const myBalance = me ? +me.balance.toFixed(2) : 0;

        // Member balances sorted: admins first, then by balance desc
        const sortedMembers = [...group.toObject().members].sort((a, b) => {
            if (a.role === "admin" && b.role !== "admin") return -1;
            if (b.role === "admin" && a.role !== "admin") return 1;
            return b.balance - a.balance;
        });

        return sendSuccess(
            res,
            {
                group: {
                    ...group.toObject(),
                    expenses: sortedExpenses,
                    members: sortedMembers,
                    myBalance,
                },
            },
            "Group fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// POST /api/groups
// Powers: Add Group overlay
// Body: { name, icon?, type?, members? }
// ═══════════════════════════════════════════════════════════════
exports.createGroup = async (req, res, next) => {
    try {
        const { name, icon, type, members } = req.body;

        if (!name || name.trim().length < 2)
            return sendError(
                res,
                "Group name (min 2 chars) is required.",
                "400",
            );

        const validTypes = ["home", "trip", "work", "other"];
        if (type && !validTypes.includes(type))
            return sendError(
                res,
                `Invalid type. Valid: ${validTypes.join(", ")}`,
                "400",
            );

        // Creator is always admin
        const memberList = [
            {
                user: req.user.id,
                name: req.user.name,
                role: "admin",
                isAppUser: true,
                balance: 0,
            },
        ];

        if (members && Array.isArray(members)) {
            // Dedup by userId or phone
            const seenIds = new Set([req.user.id.toString()]);
            const seenPhones = new Set();

            members.forEach((m) => {
                if (!m.userId && !m.name) return;

                // Skip duplicates
                if (m.userId) {
                    if (seenIds.has(m.userId.toString())) return;
                    seenIds.add(m.userId.toString());
                }
                if (m.phone) {
                    if (seenPhones.has(m.phone)) return;
                    seenPhones.add(m.phone);
                }

                memberList.push({
                    user: m.userId || undefined,
                    name: m.name || undefined,
                    phone: m.phone || undefined,
                    role: "member",
                    isAppUser: !!m.userId,
                    balance: 0,
                });
            });
        }

        const group = await Group.create({
            name: name.trim(),
            icon: icon || "👥",
            type: type || "other",
            createdBy: req.user.id,
            members: memberList,
        });

        return sendSuccess(res, { group }, "Group created successfully.");
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// PATCH /api/groups/:id
// Powers: Edit group name, icon, type (admin only)
// Body: { name?, icon?, type? }
// ═══════════════════════════════════════════════════════════════
exports.updateGroup = async (req, res, next) => {
    try {
        const { name, icon, type } = req.body;

        const group = await Group.findById(req.params.id);
        if (!group) return sendError(res, "Group not found.", "404");

        const isAdmin = group.members.some(
            (m) =>
                m.user?.toString() === req.user.id.toString() &&
                m.role === "admin",
        );
        if (!isAdmin)
            return sendError(res, "Only admins can edit the group.", "403");

        const validTypes = ["home", "trip", "work", "other"];
        if (type && !validTypes.includes(type))
            return sendError(
                res,
                `Invalid type. Valid: ${validTypes.join(", ")}`,
                "400",
            );

        if (name) group.name = name.trim();
        if (icon) group.icon = icon;
        if (type) group.type = type;

        await group.save();

        return sendSuccess(res, { group }, "Group updated successfully.");
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// POST /api/groups/:id/members
// Powers: Add member in group detail / edit group overlay
// Body: { userId?, name?, phone? }
// ═══════════════════════════════════════════════════════════════
exports.addMember = async (req, res, next) => {
    try {
        const { userId, name, phone } = req.body;

        if (!userId && !name)
            return sendError(res, "userId or name is required.", "400");

        const group = await Group.findById(req.params.id);
        if (!group) return sendError(res, "Group not found.", "404");

        const isAdmin = group.members.some(
            (m) =>
                m.user?.toString() === req.user.id.toString() &&
                m.role === "admin",
        );
        if (!isAdmin)
            return sendError(res, "Only admins can add members.", "403");

        // Duplicate check
        if (userId && group.members.some((m) => m.user?.toString() === userId))
            return sendError(res, "This user is already in the group.", "409");
        if (phone && group.members.some((m) => m.phone === phone))
            return sendError(
                res,
                "A member with this phone is already in the group.",
                "409",
            );

        group.members.push({
            user: userId || undefined,
            name: name || undefined,
            phone: phone || undefined,
            role: "member",
            isAppUser: !!userId,
            balance: 0,
        });

        await group.save();

        return sendSuccess(
            res,
            { members: group.members },
            "Member added successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// DELETE /api/groups/:id/members/:memberId
// Powers: Remove member from group (admin only)
// Blocked if member has unsettled balance
// ═══════════════════════════════════════════════════════════════
exports.removeMember = async (req, res, next) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return sendError(res, "Group not found.", "404");

        const isAdmin = group.members.some(
            (m) =>
                m.user?.toString() === req.user.id.toString() &&
                m.role === "admin",
        );
        if (!isAdmin)
            return sendError(res, "Only admins can remove members.", "403");

        const member = group.members.id(req.params.memberId);
        if (!member)
            return sendError(res, "Member not found in this group.", "404");

        // Cannot remove the only admin
        const isLastAdmin =
            member.role === "admin" &&
            group.members.filter((m) => m.role === "admin").length === 1;
        if (isLastAdmin)
            return sendError(
                res,
                "Cannot remove the only admin. Assign another admin first.",
                "400",
            );

        // Block removal if unsettled balance
        if (Math.abs(member.balance) > 0.005)
            return sendError(
                res,
                `Cannot remove — member has an unsettled balance of ₹${Math.abs(member.balance).toFixed(2)}.`,
                "400",
            );

        group.members.pull({ _id: req.params.memberId });
        await group.save();

        return sendSuccess(
            res,
            { members: group.members },
            "Member removed successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// POST /api/groups/:id/expenses
// Powers: Add Group Expense overlay
// Supports: equal / percent / custom split types
// Body: { description, amount, paidBy?, date?, category?, splitType?, splits?, note? }
// ═══════════════════════════════════════════════════════════════
exports.addExpense = async (req, res, next) => {
    try {
        const {
            description,
            amount,
            paidBy,
            date,
            category,
            splitType,
            splits,
            note,
        } = req.body;

        if (!description || !amount)
            return sendError(
                res,
                "description and amount are required.",
                "400",
            );
        if (isNaN(Number(amount)) || Number(amount) <= 0)
            return sendError(res, "amount must be a positive number.", "400");

        if (category && !VALID_CATEGORIES.includes(category))
            return sendError(
                res,
                `Invalid category. Valid: ${VALID_CATEGORIES.join(", ")}`,
                "400",
            );

        const sType = splitType || "equal";
        if (!VALID_SPLIT_TYPES.includes(sType))
            return sendError(
                res,
                `Invalid splitType. Valid: ${VALID_SPLIT_TYPES.join(", ")}`,
                "400",
            );

        const group = await Group.findById(req.params.id);
        if (!group) return sendError(res, "Group not found.", "404");

        const isMember = group.members.some(
            (m) => m.user?.toString() === req.user.id.toString(),
        );
        if (!isMember) return sendError(res, "Not a group member.", "403");

        const totalAmount = +Number(amount).toFixed(2);
        // paidBy can be any member (prototype has a member selector)
        const payerId = paidBy || req.user.id.toString();

        // Verify payer is a member
        const payerMember = group.members.find(
            (m) => m.user?.toString() === payerId.toString(),
        );
        if (!payerMember)
            return sendError(
                res,
                "paidBy must be a member of this group.",
                "400",
            );

        let calculatedSplits = [];

        // ── Equal split ───────────────────────────────────────────
        if (sType === "equal") {
            const share = +(totalAmount / group.members.length).toFixed(2);
            calculatedSplits = group.members.map((m) => ({
                member: m.user || undefined,
                name: m.name || undefined,
                share,
                settled: m.user?.toString() === payerId.toString(),
            }));
        }

        // ── Percent split ─────────────────────────────────────────
        else if (sType === "percent") {
            if (!splits || !splits.length)
                return sendError(
                    res,
                    "splits array with percent values is required for percent split.",
                    "400",
                );

            const totalPct = splits.reduce(
                (s, sp) => s + Number(sp.percent || 0),
                0,
            );
            if (Math.abs(totalPct - 100) > 0.5)
                return sendError(
                    res,
                    `Percentages must add up to 100 (got ${totalPct}).`,
                    "400",
                );

            calculatedSplits = splits.map((sp) => ({
                member: sp.member || undefined,
                name: sp.name || undefined,
                percent: +Number(sp.percent).toFixed(2),
                share: +(totalAmount * (Number(sp.percent) / 100)).toFixed(2),
                settled: sp.member?.toString() === payerId.toString(),
            }));
        }

        // ── Custom split ──────────────────────────────────────────
        else if (sType === "custom") {
            if (!splits || !splits.length)
                return sendError(
                    res,
                    "splits array with share values is required for custom split.",
                    "400",
                );

            const sum = splits.reduce((s, sp) => s + Number(sp.share || 0), 0);
            if (Math.abs(sum - totalAmount) > 1)
                return sendError(
                    res,
                    `Custom splits (₹${sum.toFixed(2)}) don't add up to ₹${totalAmount}.`,
                    "400",
                );

            calculatedSplits = splits.map((sp) => ({
                member: sp.member || undefined,
                name: sp.name || undefined,
                share: +Number(sp.share).toFixed(2),
                settled: sp.member?.toString() === payerId.toString(),
            }));
        }

        // Push expense
        group.expenses.push({
            description: description.trim(),
            amount: totalAmount,
            paidBy: payerId,
            date: date ? new Date(date) : new Date(),
            category: category || "other",
            splitType: sType,
            splits: calculatedSplits,
            note: note || "",
        });

        // ── Update member balances ────────────────────────────────
        // Payer gets credit for others' shares; others get debited their share.
        calculatedSplits.forEach((sp) => {
            // Find member by ObjectId or by name (for non-app members)
            const member = group.members.find((m) => {
                if (sp.member && m.user)
                    return m.user.toString() === sp.member.toString();
                if (sp.name && m.name) return m.name === sp.name;
                return false;
            });
            if (!member) return;

            if (member.user?.toString() === payerId.toString()) {
                // Payer: credited for what others owe them
                member.balance += +(totalAmount - sp.share).toFixed(2);
            } else {
                // Others: debited their share
                member.balance -= sp.share;
                member.balance = +member.balance.toFixed(2);
            }
        });

        await group.save(); // pre-save hook updates totalExpenses + lastExpense

        return sendSuccess(
            res,
            {
                totalExpenses: group.totalExpenses,
                lastExpenseDesc: group.lastExpenseDesc,
                expense: group.expenses[group.expenses.length - 1],
            },
            "Expense added to group successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// DELETE /api/groups/:id/expenses/:expenseId
// Powers: Delete a wrongly added group expense
// Only the payer or a group admin can delete
// ═══════════════════════════════════════════════════════════════
exports.deleteExpense = async (req, res, next) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return sendError(res, "Group not found.", "404");

        const isMember = group.members.some(
            (m) => m.user?.toString() === req.user.id.toString(),
        );
        if (!isMember) return sendError(res, "Not a group member.", "403");

        const expense = group.expenses.id(req.params.expenseId);
        if (!expense) return sendError(res, "Expense not found.", "404");

        const isAdmin = group.members.some(
            (m) =>
                m.user?.toString() === req.user.id.toString() &&
                m.role === "admin",
        );
        const isPayer = expense.paidBy?.toString() === req.user.id.toString();

        if (!isAdmin && !isPayer)
            return sendError(
                res,
                "Only the payer or an admin can delete this expense.",
                "403",
            );

        // Reverse the balance changes this expense caused
        expense.splits.forEach((sp) => {
            const member = group.members.find((m) => {
                if (sp.member && m.user)
                    return m.user.toString() === sp.member.toString();
                if (sp.name && m.name) return m.name === sp.name;
                return false;
            });
            if (!member) return;

            if (member.user?.toString() === expense.paidBy?.toString()) {
                member.balance -= +(expense.amount - sp.share).toFixed(2);
            } else {
                member.balance += sp.share;
                member.balance = +member.balance.toFixed(2);
            }
        });

        group.expenses.pull({ _id: req.params.expenseId });
        await group.save(); // pre-save hook recalculates totalExpenses + lastExpense

        return sendSuccess(
            res,
            {
                totalExpenses: group.totalExpenses,
                lastExpenseDesc: group.lastExpenseDesc,
            },
            "Expense deleted successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// POST /api/groups/:id/settle/:memberId
// Powers: "Settle Up" button in group detail
// Zeros out a member's balance
// ═══════════════════════════════════════════════════════════════
exports.settleMember = async (req, res, next) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return sendError(res, "Group not found.", "404");

        const isMember = group.members.some(
            (m) => m.user?.toString() === req.user.id.toString(),
        );
        if (!isMember) return sendError(res, "Not a group member.", "403");

        const member = group.members.id(req.params.memberId);
        if (!member) return sendError(res, "Member not found.", "404");

        if (Math.abs(member.balance) < 0.005)
            return sendError(res, "This member is already settled.", "400");

        const previousBalance = +member.balance.toFixed(2);
        member.balance = 0;

        // Mark all unsettled splits for this member as settled
        group.expenses.forEach((exp) => {
            exp.splits.forEach((sp) => {
                if (sp.member?.toString() === member.user?.toString())
                    sp.settled = true;
            });
        });

        await group.save();

        return sendSuccess(
            res,
            {
                previousBalance,
                newBalance: 0,
            },
            "Member settled successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// DELETE /api/groups/:id
// Powers: Archive/delete group (admin only)
// ═══════════════════════════════════════════════════════════════
exports.deleteGroup = async (req, res, next) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return sendError(res, "Group not found.", "404");

        const isAdmin = group.members.some(
            (m) =>
                m.user?.toString() === req.user.id.toString() &&
                m.role === "admin",
        );
        if (!isAdmin)
            return sendError(res, "Only admins can delete the group.", "403");

        group.isActive = false;
        await group.save();

        return sendSuccess(res, null, "Group archived successfully.");
    } catch (err) {
        next(err);
    }
};
