const Expense = require("../models/Expense");
const Group = require("../models/Group");
const User = require("../models/User");
const { sendSuccess, sendError } = require("../utils/response");

// ─── All categories with icons (matches prototype UI exactly) ─
const CATEGORY_META = {
    food: { icon: "🍕", label: "Food & Drinks" },
    travel: { icon: "🚌", label: "Travel" },
    bills: { icon: "⚡", label: "Bills & Utilities" },
    entertainment: { icon: "🎬", label: "Fun & Entertainment" },
    shopping: { icon: "🛒", label: "Shopping" },
    health: { icon: "🏥", label: "Health & Medical" },
    education: { icon: "📚", label: "Education" },
    home: { icon: "🏡", label: "Home & Rent" },
    family: { icon: "👨‍👩‍👧", label: "Family" },
    emi: { icon: "🏦", label: "EMI / Loans" },
    gifts: { icon: "🎁", label: "Gifts" },
    drinks: { icon: "🍺", label: "Drinks" },
    fuel: { icon: "⛽", label: "Fuel" },
    trip: { icon: "✈️", label: "Trip" },
    miscellaneous: { icon: "🗂️", label: "Miscellaneous" },
    other: { icon: "➕", label: "Other" },
};

const VALID_CATEGORIES = Object.keys(CATEGORY_META);
const VALID_SPLIT_TYPES = ["solo", "group", "friend"];
const VALID_PAID_VIA = ["upi", "cash", "card", "bank", "other"];

const toMonthKey = (year, month) => `${year}-${String(month).padStart(2, "0")}`;

// ═══════════════════════════════════════════════════════════════
// GET /api/expenses?month=2026-03&category=food&splitType=solo
// Returns monthly totals + per-category breakdown (all categories shown)
// Matches prototype: main expense screen with category list
// ═══════════════════════════════════════════════════════════════
exports.getExpenses = async (req, res, next) => {
    try {
        const { month, category, splitType } = req.query;

        const monthKey =
            month ||
            toMonthKey(new Date().getFullYear(), new Date().getMonth() + 1);

        // Validate month format (YYYY-MM)
        if (!/^\d{4}-\d{2}$/.test(monthKey))
            return sendError(
                res,
                "Invalid month format. Use YYYY-MM (e.g. 2026-03).",
                "400",
            );

        const filter = { owner: req.user.id, monthKey };

        if (category) {
            if (!VALID_CATEGORIES.includes(category))
                return sendError(
                    res,
                    `Invalid category. Valid: ${VALID_CATEGORIES.join(", ")}`,
                    "400",
                );
            filter.category = category;
        }
        if (splitType) {
            if (!VALID_SPLIT_TYPES.includes(splitType))
                return sendError(
                    res,
                    `Invalid splitType. Valid: ${VALID_SPLIT_TYPES.join(", ")}`,
                    "400",
                );
            filter.splitType = splitType;
        }

        const expenses = await Expense.find(filter)
            .populate("splitWith", "name avatar")
            .sort({ date: -1 });

        // Build byCategory — always include ALL categories (with 0 if no entries)
        // This matches the prototype which shows every category row
        const byCategory = {};
        VALID_CATEGORIES.forEach((cat) => {
            byCategory[cat] = {
                total: 0,
                count: 0,
                icon: CATEGORY_META[cat].icon,
                label: CATEGORY_META[cat].label,
            };
        });

        let totalAmount = 0;
        expenses.forEach((e) => {
            totalAmount += e.amount;
            const cat = e.category || "other";
            if (byCategory[cat]) {
                byCategory[cat].total += e.amount;
                byCategory[cat].count += 1;
            }
        });

        // If filtering by category, only return that category in byCategory
        // (keeps response clean when drilling into a specific category)
        const byCategoryResult = category
            ? { [category]: byCategory[category] }
            : byCategory;

        return sendSuccess(
            res,
            {
                monthKey,
                totalAmount: +totalAmount.toFixed(2),
                count: expenses.length,
                byCategory: byCategoryResult,
                expenses,
            },
            "Expenses fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// GET /api/expenses/category/:category?month=2026-03
// Drill-down: all entries for one category in a month
// Matches prototype: tapping a category row → shows individual entries
// ═══════════════════════════════════════════════════════════════
exports.getByCategory = async (req, res, next) => {
    try {
        const { category } = req.params;
        const { month } = req.query;

        if (!VALID_CATEGORIES.includes(category))
            return sendError(
                res,
                `Invalid category. Valid: ${VALID_CATEGORIES.join(", ")}`,
                "400",
            );

        const monthKey =
            month ||
            toMonthKey(new Date().getFullYear(), new Date().getMonth() + 1);

        if (!/^\d{4}-\d{2}$/.test(monthKey))
            return sendError(res, "Invalid month format. Use YYYY-MM.", "400");

        const expenses = await Expense.find({
            owner: req.user.id,
            category,
            monthKey,
        })
            .populate("splitWith", "name avatar")
            .sort({ date: -1 });

        const total = expenses.reduce((s, e) => s + e.amount, 0);

        return sendSuccess(
            res,
            {
                category,
                icon: CATEGORY_META[category].icon,
                label: CATEGORY_META[category].label,
                monthKey,
                total: +total.toFixed(2),
                count: expenses.length,
                expenses,
            },
            "Category expenses fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// GET /api/expenses/:id
// Single expense detail
// ═══════════════════════════════════════════════════════════════
exports.getExpense = async (req, res, next) => {
    try {
        const expense = await Expense.findOne({
            _id: req.params.id,
            owner: req.user.id,
        }).populate("splitWith", "name avatar phone");

        if (!expense) return sendError(res, "Expense not found.", "404");

        return sendSuccess(res, { expense }, "Expense fetched successfully.");
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// POST /api/expenses
// Create a new expense
// Matches prototype: Add Expense overlay with category grid,
// description, date, paid via, optional split
// ═══════════════════════════════════════════════════════════════
exports.createExpense = async (req, res, next) => {
    try {
        const {
            amount,
            category,
            description,
            date,
            paidVia,
            splitType,
            splitWith,
            group,
            note,
        } = req.body;

        // ── Validation ──────────────────────────────────────────────
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
            return sendError(res, "Valid amount is required.", "400");

        if (category && !VALID_CATEGORIES.includes(category))
            return sendError(
                res,
                `Invalid category. Valid: ${VALID_CATEGORIES.join(", ")}`,
                "400",
            );

        if (paidVia && !VALID_PAID_VIA.includes(paidVia))
            return sendError(
                res,
                `Invalid paidVia. Valid: ${VALID_PAID_VIA.join(", ")}`,
                "400",
            );

        if (splitType && !VALID_SPLIT_TYPES.includes(splitType))
            return sendError(
                res,
                `Invalid splitType. Valid: ${VALID_SPLIT_TYPES.join(", ")}`,
                "400",
            );

        // ── FIX: Validate group reference if provided ───────────────
        if (group) {
            const grp = await Group.findOne({
                _id: group,
                "members.user": req.user.id,
                isActive: true,
            });
            if (!grp)
                return sendError(
                    res,
                    "Group not found or you are not a member.",
                    "404",
                );
        }

        // ── FIX: Validate splitWith user IDs if provided ────────────
        if (splitWith && Array.isArray(splitWith) && splitWith.length > 0) {
            // Remove duplicates and the expense owner themselves
            const uniqueIds = [
                ...new Set(
                    splitWith.filter(
                        (id) => id && id !== req.user.id.toString(),
                    ),
                ),
            ];

            if (uniqueIds.length > 0) {
                const foundUsers = await User.find({
                    _id: { $in: uniqueIds },
                    isActive: true,
                })
                    .select("_id")
                    .lean();

                if (foundUsers.length !== uniqueIds.length)
                    return sendError(
                        res,
                        "One or more users in splitWith not found.",
                        "400",
                    );
            }
        }

        const expense = await Expense.create({
            owner: req.user.id,
            amount: +Number(amount).toFixed(2),
            category: category || "other",
            description: description?.trim() || undefined,
            date: date ? new Date(date) : new Date(),
            paidVia: paidVia || "cash",
            splitType: splitType || "solo",
            splitWith: splitWith && Array.isArray(splitWith) ? splitWith : [],
            group: group || undefined,
            note: note?.trim() || undefined,
            // monthKey is auto-set by pre-save hook from date
        });

        return sendSuccess(res, { expense }, "Expense added successfully.");
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// PATCH /api/expenses/:id
// Update an expense
// FIX: monthKey is now recalculated when date changes
// ═══════════════════════════════════════════════════════════════
exports.updateExpense = async (req, res, next) => {
    try {
        const allowed = [
            "amount",
            "category",
            "description",
            "date",
            "paidVia",
            "splitType",
            "note",
        ];
        let hasUpdate = false;

        // ── Validate fields before touching the DB ──────────────────
        if (req.body.amount !== undefined) {
            if (isNaN(Number(req.body.amount)) || Number(req.body.amount) <= 0)
                return sendError(res, "Valid amount is required.", "400");
        }
        if (req.body.category && !VALID_CATEGORIES.includes(req.body.category))
            return sendError(
                res,
                `Invalid category. Valid: ${VALID_CATEGORIES.join(", ")}`,
                "400",
            );
        if (req.body.paidVia && !VALID_PAID_VIA.includes(req.body.paidVia))
            return sendError(
                res,
                `Invalid paidVia. Valid: ${VALID_PAID_VIA.join(", ")}`,
                "400",
            );
        if (
            req.body.splitType &&
            !VALID_SPLIT_TYPES.includes(req.body.splitType)
        )
            return sendError(
                res,
                `Invalid splitType. Valid: ${VALID_SPLIT_TYPES.join(", ")}`,
                "400",
            );

        // ── FIX: Use findOne + save so pre-save hook runs ───────────
        // findOneAndUpdate with $set BYPASSES hooks → monthKey won't update when date changes
        const expense = await Expense.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!expense) return sendError(res, "Expense not found.", "404");

        allowed.forEach((field) => {
            if (req.body[field] !== undefined) {
                if (field === "amount") {
                    expense.amount = +Number(req.body.amount).toFixed(2);
                } else if (field === "date") {
                    expense.date = new Date(req.body.date);
                    // monthKey will be recalculated by pre-save hook since date is modified
                } else if (field === "description" || field === "note") {
                    expense[field] = req.body[field]?.trim() || undefined;
                } else {
                    expense[field] = req.body[field];
                }
                hasUpdate = true;
            }
        });

        if (!hasUpdate)
            return sendError(res, "No valid fields provided to update.", "400");

        await expense.save(); // pre-save hook fires → monthKey recalculated if date changed

        return sendSuccess(res, { expense }, "Expense updated successfully.");
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// DELETE /api/expenses/:id
// ═══════════════════════════════════════════════════════════════
exports.deleteExpense = async (req, res, next) => {
    try {
        const expense = await Expense.findOneAndDelete({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!expense) return sendError(res, "Expense not found.", "404");
        return sendSuccess(res, null, "Expense deleted successfully.");
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// GET /api/expenses/report/monthly?months=6
// Monthly summary for Reports screen
// FIX: now includes category icons in the report
// ═══════════════════════════════════════════════════════════════
exports.getMonthlyReport = async (req, res, next) => {
    try {
        const months = Math.min(Number(req.query.months) || 6, 24);

        const keys = [];
        const now = new Date();
        for (let i = 0; i < months; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            keys.push(toMonthKey(d.getFullYear(), d.getMonth() + 1));
        }

        const expenses = await Expense.find({
            owner: req.user.id,
            monthKey: { $in: keys },
        });

        // Initialize report with all months AND all category icons
        const report = {};
        keys.forEach((k) => {
            report[k] = {
                total: 0,
                count: 0,
                byCategory: {},
            };
            // Pre-populate all categories with 0 so frontend always has them
            VALID_CATEGORIES.forEach((cat) => {
                report[k].byCategory[cat] = {
                    total: 0,
                    count: 0,
                    icon: CATEGORY_META[cat].icon,
                    label: CATEGORY_META[cat].label,
                };
            });
        });

        expenses.forEach((e) => {
            const k = e.monthKey;
            const cat = e.category || "other";
            if (!report[k]) return;

            report[k].total += e.amount;
            report[k].count += 1;
            report[k].byCategory[cat].total += e.amount;
            report[k].byCategory[cat].count += 1;
        });

        // Round totals
        Object.values(report).forEach((m) => {
            m.total = +m.total.toFixed(2);
            Object.values(m.byCategory).forEach((c) => {
                c.total = +c.total.toFixed(2);
            });
        });

        return sendSuccess(
            res,
            {
                months,
                monthKeys: keys,
                report,
            },
            "Monthly report fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};
