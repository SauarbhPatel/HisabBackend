const Expense = require("../models/Expense");
const Project = require("../models/Project");
const Friend = require("../models/Friend");
const { sendSuccess, sendError } = require("../utils/response");

// ─── Category meta (icons + labels) ─────────────────────────
const CATEGORY_META = {
    food: { icon: "🍕", label: "Food & Drinks" },
    travel: { icon: "🚌", label: "Travel" },
    bills: { icon: "⚡", label: "Bills & Utilities" },
    entertainment: { icon: "🎬", label: "Fun & Entertainment" },
    shopping: { icon: "🛒", label: "Shopping" },
    health: { icon: "🏥", label: "Health & Medical" },
    education: { icon: "📚", label: "Education" },
    fashion: { icon: "👗", label: "Fashion & Clothing" },
    rent: { icon: "🏠", label: "Rent" },
    medical: { icon: "💊", label: "Medical" },
    gifts: { icon: "🎁", label: "Gifts" },
    drinks: { icon: "🍺", label: "Drinks" },
    fuel: { icon: "⛽", label: "Fuel" },
    recharge: { icon: "📱", label: "Recharge" },
    trip: { icon: "✈️", label: "Trip" },
    other: { icon: "➕", label: "Other" },
};

// ─── Helper: build list of YYYY-MM keys for a period ─────────
const getMonthKeys = (period) => {
    const now = new Date();
    const keys = [];
    let n = 1;
    if (period === "3months") n = 3;
    else if (period === "year") n = 12;

    for (let i = 0; i < n; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        keys.push(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        );
    }
    return keys; // newest first
};

// ─── Helper: build category breakdown from expenses array ───
const buildCategoryBreakdown = (expenses) => {
    const breakdown = {};
    Object.keys(CATEGORY_META).forEach((cat) => {
        breakdown[cat] = { total: 0, count: 0, ...CATEGORY_META[cat] };
    });
    expenses.forEach((e) => {
        const cat = e.category || "other";
        if (breakdown[cat]) {
            breakdown[cat].total += e.amount;
            breakdown[cat].count += 1;
        }
    });
    // Round
    Object.values(breakdown).forEach((c) => {
        c.total = +c.total.toFixed(2);
    });
    return breakdown;
};

// ═══════════════════════════════════════════════════════════════
// GET /api/reports/summary?period=month|3months|year
// Powers: Reports screen — all three useCase modes
// ═══════════════════════════════════════════════════════════════
exports.getReportSummary = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const useCase = req.user.useCase;
        const period = ["month", "3months", "year"].includes(req.query.period)
            ? req.query.period
            : "month";

        const monthKeys = getMonthKeys(period);
        const result = { useCase, period, monthKeys };

        // ══════════════════════════════════════════════════════════
        //  SPLIT  — Expense breakdown + Friends summary
        // ══════════════════════════════════════════════════════════
        if (useCase === "split" || useCase === "both") {
            const [expenses, friends] = await Promise.all([
                Expense.find({ owner: userId, monthKey: { $in: monthKeys } }),
                Friend.find({ owner: userId, isActive: true }),
            ]);

            const totalSpent = +expenses
                .reduce((s, e) => s + e.amount, 0)
                .toFixed(2);
            const byCategory = buildCategoryBreakdown(expenses);

            // Top 4 categories for the bar chart (sorted by total)
            const topCategories = Object.entries(byCategory)
                .filter(([, v]) => v.count > 0)
                .sort(([, a], [, b]) => b.total - a.total)
                .slice(0, 4)
                .map(([key, val]) => ({ category: key, ...val }));

            // By month (for the "Last 3 Months" view)
            const byMonth = monthKeys.map((k) => ({
                monthKey: k,
                total: +expenses
                    .filter((e) => e.monthKey === k)
                    .reduce((s, e) => s + e.amount, 0)
                    .toFixed(2),
            }));

            // Friends summary
            const owedToYou = +friends
                .filter((f) => f.balance > 0)
                .reduce((s, f) => s + f.balance, 0)
                .toFixed(2);
            const youOwe = +friends
                .filter((f) => f.balance < 0)
                .reduce((s, f) => s + Math.abs(f.balance), 0)
                .toFixed(2);

            result.split = {
                totalSpent,
                byCategory, // donut chart data (all 16 categories)
                topCategories, // bar chart data (top 4)
                byMonth, // monthly bar data for multi-month views
                friends: {
                    owedToYou,
                    youOwe,
                    netBalance: +(owedToYou - youOwe).toFixed(2),
                },
            };
        }

        // ══════════════════════════════════════════════════════════
        //  FREELANCE  — Project income + client bars + profit
        // ══════════════════════════════════════════════════════════
        if (useCase === "freelance" || useCase === "both") {
            const projects = await Project.find({
                owner: userId,
                isArchived: false,
            });

            // Filter client payments to the selected period
            const periodPayments = [];
            projects.forEach((p) => {
                p.clientPayments.forEach((cp) => {
                    const d = new Date(cp.date);
                    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                    if (cp.status === "paid" && monthKeys.includes(k)) {
                        periodPayments.push({
                            project: p.name,
                            client: p.client,
                            amount: cp.amount,
                            date: cp.date,
                            monthKey: k,
                        });
                    }
                });
            });

            const totalIncome = +periodPayments
                .reduce((s, p) => s + p.amount, 0)
                .toFixed(2);

            // Dev payments made in period
            let totalDevPaid = 0;
            projects.forEach((p) => {
                p.developers.forEach((d) => {
                    (d.payments || []).forEach((dp) => {
                        const k = `${new Date(dp.date).getFullYear()}-${String(new Date(dp.date).getMonth() + 1).padStart(2, "0")}`;
                        if (monthKeys.includes(k)) totalDevPaid += dp.amount;
                    });
                });
            });
            totalDevPaid = +totalDevPaid.toFixed(2);

            // Income by client (for the bar chart)
            const byClient = {};
            periodPayments.forEach((p) => {
                if (!byClient[p.client]) byClient[p.client] = 0;
                byClient[p.client] += p.amount;
            });
            Object.keys(byClient).forEach((k) => {
                byClient[k] = +byClient[k].toFixed(2);
            });

            // Sorted for bar chart rendering
            const incomeByClient = Object.entries(byClient)
                .sort(([, a], [, b]) => b - a)
                .map(([client, total]) => ({ client, total }));

            // Project income list (individual payments, newest first) for the income card
            const projectIncomeList = periodPayments
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map((p) => ({
                    project: p.project,
                    client: p.client,
                    amount: p.amount,
                    date: p.date,
                    monthKey: p.monthKey,
                }));

            // Income by month
            const incomeByMonth = monthKeys.map((k) => ({
                monthKey: k,
                total: +periodPayments
                    .filter((p) => p.monthKey === k)
                    .reduce((s, p) => s + p.amount, 0)
                    .toFixed(2),
            }));

            result.freelance = {
                totalIncome,
                totalDevPaid,
                netProfit: +(totalIncome - totalDevPaid).toFixed(2),
                byClient, // { "School ERP": 12500, "Flatshare Karo": 11000 }
                incomeByClient, // sorted array for bar chart
                projectIncomeList, // individual payment rows in the income card
                incomeByMonth, // monthly totals for multi-month view
                profitAnalysis: {
                    totalIncome,
                    totalDevPaid,
                    netProfit: +(totalIncome - totalDevPaid).toFixed(2),
                },
            };
        }

        return sendSuccess(
            res,
            { report: result },
            "Report fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// GET /api/reports/spending?period=month|3months|year
// Powers: Spending breakdown card (donut + bars) for split/both
// ═══════════════════════════════════════════════════════════════
exports.getSpendingReport = async (req, res, next) => {
    try {
        const period = ["month", "3months", "year"].includes(req.query.period)
            ? req.query.period
            : "month";
        const monthKeys = getMonthKeys(period);

        const expenses = await Expense.find({
            owner: req.user.id,
            monthKey: { $in: monthKeys },
        });

        const totalSpent = +expenses
            .reduce((s, e) => s + e.amount, 0)
            .toFixed(2);
        const byCategory = buildCategoryBreakdown(expenses);
        const topCategories = Object.entries(byCategory)
            .filter(([, v]) => v.count > 0)
            .sort(([, a], [, b]) => b.total - a.total)
            .slice(0, 4)
            .map(([key, val]) => ({ category: key, ...val }));

        const byMonth = monthKeys.map((k) => ({
            monthKey: k,
            total: +expenses
                .filter((e) => e.monthKey === k)
                .reduce((s, e) => s + e.amount, 0)
                .toFixed(2),
        }));

        return sendSuccess(
            res,
            {
                period,
                monthKeys,
                totalSpent,
                byCategory,
                topCategories,
                byMonth,
            },
            "Spending report fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// GET /api/reports/income?period=month|3months|year
// Powers: Project income card + income-by-client bars + profit card
// ═══════════════════════════════════════════════════════════════
exports.getIncomeReport = async (req, res, next) => {
    try {
        const period = ["month", "3months", "year"].includes(req.query.period)
            ? req.query.period
            : "month";
        const monthKeys = getMonthKeys(period);

        const projects = await Project.find({
            owner: req.user.id,
            isArchived: false,
        });

        // Client payments received in period
        const periodPayments = [];
        let totalDevPaid = 0;

        projects.forEach((p) => {
            p.clientPayments.forEach((cp) => {
                const d = new Date(cp.date);
                const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                if (cp.status === "paid" && monthKeys.includes(k)) {
                    periodPayments.push({
                        project: p.name,
                        client: p.client,
                        amount: cp.amount,
                        date: cp.date,
                        monthKey: k,
                        label: cp.label,
                    });
                }
            });
            p.developers.forEach((d) => {
                (d.payments || []).forEach((dp) => {
                    const d2 = new Date(dp.date);
                    const k = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}`;
                    if (monthKeys.includes(k)) totalDevPaid += dp.amount;
                });
            });
        });

        const totalIncome = +periodPayments
            .reduce((s, p) => s + p.amount, 0)
            .toFixed(2);
        totalDevPaid = +totalDevPaid.toFixed(2);

        const byClient = {};
        periodPayments.forEach((p) => {
            if (!byClient[p.client]) byClient[p.client] = 0;
            byClient[p.client] += p.amount;
        });
        Object.keys(byClient).forEach((k) => {
            byClient[k] = +byClient[k].toFixed(2);
        });

        const incomeByClient = Object.entries(byClient)
            .sort(([, a], [, b]) => b - a)
            .map(([client, total]) => ({ client, total }));

        const incomeByMonth = monthKeys.map((k) => ({
            monthKey: k,
            total: +periodPayments
                .filter((p) => p.monthKey === k)
                .reduce((s, p) => s + p.amount, 0)
                .toFixed(2),
        }));

        return sendSuccess(
            res,
            {
                period,
                monthKeys,
                totalIncome,
                totalDevPaid,
                netProfit: +(totalIncome - totalDevPaid).toFixed(2),
                byClient,
                incomeByClient,
                incomeByMonth,
                projectIncomeList: periodPayments.sort(
                    (a, b) => new Date(b.date) - new Date(a.date),
                ),
                profitAnalysis: {
                    totalIncome,
                    totalDevPaid,
                    netProfit: +(totalIncome - totalDevPaid).toFixed(2),
                },
            },
            "Income report fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ═══════════════════════════════════════════════════════════════
// GET /api/reports/friends?period=month|3months|year
// Powers: Friends Summary card in split/both reports screen
// ═══════════════════════════════════════════════════════════════
exports.getFriendsReport = async (req, res, next) => {
    try {
        const friends = await Friend.find({
            owner: req.user.id,
            isActive: true,
        });

        const owedToYou = +friends
            .filter((f) => f.balance > 0)
            .reduce((s, f) => s + f.balance, 0)
            .toFixed(2);
        const youOwe = +friends
            .filter((f) => f.balance < 0)
            .reduce((s, f) => s + Math.abs(f.balance), 0)
            .toFixed(2);

        // Top friends who owe you (for "Friends Summary" card)
        const topOwed = friends
            .filter((f) => f.balance > 0)
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 5)
            .map((f) => ({
                name: f.friendName,
                balance: +f.balance.toFixed(2),
                expenseCount: f.expenseCount,
            }));

        return sendSuccess(
            res,
            {
                owedToYou,
                youOwe,
                netBalance: +(owedToYou - youOwe).toFixed(2),
                friendCount: friends.length,
                settledCount: friends.filter((f) => Math.abs(f.balance) < 0.01)
                    .length,
                topOwed,
            },
            "Friends report fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};
