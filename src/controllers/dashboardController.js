const Expense = require("../models/Expense");
const Project = require("../models/Project");
const Friend = require("../models/Friend");
const Group = require("../models/Group");
const Client = require("../models/Client");
const { sendSuccess } = require("../utils/response");

// ─── Helper: YYYY-MM key ────────────────────────────────────
const toKey = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;

const currentMonthKey = () => {
    const n = new Date();
    return toKey(n.getFullYear(), n.getMonth());
};

const prevMonthKey = () => {
    const n = new Date();
    const m = n.getMonth() === 0 ? 11 : n.getMonth() - 1;
    const y = n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear();
    return toKey(y, m);
};

// ─── Helper: last N monthly keys ────────────────────────────
const lastNMonthKeys = (n) => {
    const keys = [];
    const now = new Date();
    for (let i = 0; i < n; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        keys.push(toKey(d.getFullYear(), d.getMonth()));
    }
    return keys;
};

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard
// Powers: all three home screen modes (split / freelance / both)
// Returns data for whatever useCase the user has set.
// ═══════════════════════════════════════════════════════════════
exports.getDashboard = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const useCase = req.user.useCase; // 'split' | 'freelance' | 'both'
        const monthKey = currentMonthKey();
        const prevKey = prevMonthKey();

        const result = { useCase, monthKey };

        // ══════════════════════════════════════════════════════════
        //  SPLIT  — Friends, Expenses, Groups
        // ══════════════════════════════════════════════════════════
        if (useCase === "split" || useCase === "both") {
            const [expenses, prevExpenses, friends, groups] = await Promise.all(
                [
                    Expense.find({ owner: userId, monthKey }),
                    Expense.find({ owner: userId, monthKey: prevKey }),
                    Friend.find({ owner: userId, isActive: true }),
                    Group.find({ "members.user": userId, isActive: true }),
                ],
            );

            // Spending
            const totalSpent = +expenses
                .reduce((s, e) => s + e.amount, 0)
                .toFixed(2);
            const prevSpent = +prevExpenses
                .reduce((s, e) => s + e.amount, 0)
                .toFixed(2);
            const spentChangePct = prevSpent
                ? Math.round(((totalSpent - prevSpent) / prevSpent) * 100)
                : null;

            // Friend balances
            const owedToYou = +friends
                .filter((f) => f.balance > 0)
                .reduce((s, f) => s + f.balance, 0)
                .toFixed(2);
            const youOwe = +friends
                .filter((f) => f.balance < 0)
                .reduce((s, f) => s + Math.abs(f.balance), 0)
                .toFixed(2);

            // Groups
            const activeGroups = groups.length;
            const groupExpenseCount = groups.reduce((s, g) => {
                return (
                    s +
                    g.expenses.filter((e) => {
                        const d = new Date(e.date);
                        return (
                            toKey(d.getFullYear(), d.getMonth()) === monthKey
                        );
                    }).length
                );
            }, 0);

            // Urgent friend — highest overdue balance owed to user
            const urgentFriend = (() => {
                const top = friends
                    .filter((f) => f.balance > 0)
                    .sort((a, b) => {
                        // Sort by lastTransactionDate age (oldest first) then by amount
                        const aAge = a.lastTransactionDate
                            ? Date.now() - new Date(a.lastTransactionDate)
                            : 0;
                        const bAge = b.lastTransactionDate
                            ? Date.now() - new Date(b.lastTransactionDate)
                            : 0;
                        return bAge - aAge || b.balance - a.balance;
                    })[0];
                if (!top) return null;
                const days = top.lastTransactionDate
                    ? Math.floor(
                          (Date.now() - new Date(top.lastTransactionDate)) /
                              86400000,
                      )
                    : 0;
                return {
                    name: top.friendName || top.friend,
                    balance: top.balance,
                    daysPending: days,
                };
            })();

            // Recent activity: last 5 expenses (all categories)
            const recentExpenses = await Expense.find({ owner: userId })
                .sort({ date: -1 })
                .limit(5)
                .select("amount category description date splitType");

            result.split = {
                monthKey,
                totalSpent,
                prevSpent,
                spentChangePct, // e.g. 12 → "↑ 12% vs last month"
                owedToYou,
                youOwe,
                netBalance: +(owedToYou - youOwe).toFixed(2),
                activeGroups,
                groupExpenseCount, // "18 expenses this month" shown on group tab
                friendCount: friends.length,
                urgentFriend, // drives the ⚠️ urgent banner
                recentExpenses,
            };
        }

        // ══════════════════════════════════════════════════════════
        //  FREELANCE  — Projects, Clients, Developers
        // ══════════════════════════════════════════════════════════
        if (useCase === "freelance" || useCase === "both") {
            const [projects, clients] = await Promise.all([
                Project.find({ owner: userId, isArchived: false })
                    .populate("developers.developer", "name")
                    .sort({ updatedAt: -1 }),
                Client.find({
                    owner: userId,
                    isActive: true,
                    status: "active",
                }),
            ]);

            const totalProjectIncome = +projects
                .reduce((s, p) => s + p.receivedAmount, 0)
                .toFixed(2);
            const clientPending = +projects
                .reduce((s, p) => s + p.pendingAmount, 0)
                .toFixed(2);
            const activeProjectCount = projects.filter(
                (p) => p.status === "inprogress",
            ).length;

            // Dev pay due — across all active dev slots
            let devPayDue = 0;
            let devPayDueCount = new Set();
            projects.forEach((p) => {
                p.developers.forEach((d) => {
                    if (d.status === "active") {
                        const due = (d.agreedAmount || 0) - (d.paidAmount || 0);
                        if (due > 0) {
                            devPayDue += due;
                            devPayDueCount.add(
                                d.developer?._id?.toString() ||
                                    d.developer?.toString(),
                            );
                        }
                    }
                });
            });

            // Urgent project — largest pending client payment
            const urgentProject = projects
                .filter((p) => p.pendingAmount > 0)
                .sort((a, b) => b.pendingAmount - a.pendingAmount)[0];

            // This month's project income
            const thisMonthIncome = projects.reduce((s, p) => {
                return (
                    s +
                    p.clientPayments
                        .filter((cp) => {
                            const d = new Date(cp.date);
                            return (
                                cp.status === "paid" &&
                                toKey(d.getFullYear(), d.getMonth()) ===
                                    monthKey
                            );
                        })
                        .reduce((ps, cp) => ps + cp.amount, 0)
                );
            }, 0);

            // Recent activity: last 5 client payments received + dev payments made
            const recentProjectActivity = [];
            projects.forEach((p) => {
                // Client payments received
                p.clientPayments.forEach((cp) => {
                    recentProjectActivity.push({
                        type: "client_payment",
                        label: `${p.name} — Client Payment`,
                        amount: cp.amount,
                        date: cp.date,
                        direction: "in",
                        project: p.name,
                        client: p.client,
                        status: cp.status,
                    });
                });
                // Dev payments made
                p.developers.forEach((d) => {
                    (d.payments || []).forEach((dp) => {
                        recentProjectActivity.push({
                            type: "dev_payment",
                            label: `${d.developer?.name || "Developer"} — Dev Payment`,
                            amount: dp.amount,
                            date: dp.date,
                            direction: "out",
                            project: p.name,
                        });
                    });
                });
            });
            recentProjectActivity.sort(
                (a, b) => new Date(b.date) - new Date(a.date),
            );

            result.freelance = {
                monthKey,
                totalProjectIncome,
                clientPending,
                devPayDue: +devPayDue.toFixed(2),
                devPayDueCount: devPayDueCount.size, // "2 developers" shown in UI
                activeProjectCount,
                totalProjects: projects.length,
                clientCount: clients.length, // "3 clients" shown in UI
                thisMonthIncome: +thisMonthIncome.toFixed(2),
                urgentProject: urgentProject
                    ? {
                          name: urgentProject.name,
                          pendingAmount: urgentProject.pendingAmount,
                          client: urgentProject.client,
                      }
                    : null,
                recentActivity: recentProjectActivity.slice(0, 5),
            };
        }

        // ══════════════════════════════════════════════════════════
        //  MINI CHARTS  — for BOTH mode (7-day sparklines + counts)
        // ══════════════════════════════════════════════════════════
        if (useCase === "both") {
            // Last 7 monthly totals for the sparkline bars
            const last7Keys = lastNMonthKeys(7).reverse(); // oldest→newest

            const [allExpenses, allProjects] = await Promise.all([
                Expense.find({
                    owner: userId,
                    monthKey: { $in: last7Keys },
                }).select("amount monthKey"),
                Project.find({ owner: userId, isArchived: false }).select(
                    "clientPayments developers startDate",
                ),
            ]);

            // Spent per month
            const spentByMonth = last7Keys.map((k) => ({
                monthKey: k,
                total: +allExpenses
                    .filter((e) => e.monthKey === k)
                    .reduce((s, e) => s + e.amount, 0)
                    .toFixed(2),
            }));

            // Income per month
            const incomeByMonth = last7Keys.map((k) => {
                let total = 0;
                allProjects.forEach((p) => {
                    p.clientPayments.forEach((cp) => {
                        const d = new Date(cp.date);
                        if (
                            cp.status === "paid" &&
                            toKey(d.getFullYear(), d.getMonth()) === k
                        )
                            total += cp.amount;
                    });
                });
                return { monthKey: k, total: +total.toFixed(2) };
            });

            // Project count per month (by startDate)
            const projectsByMonth = last7Keys.map((k) => ({
                monthKey: k,
                count: allProjects.filter((p) => {
                    const d = p.startDate;
                    return toKey(d.getFullYear(), d.getMonth()) === k;
                }).length,
            }));

            result.miniCharts = {
                spentByMonth,
                incomeByMonth,
                projectsByMonth,
            };
        }

        result.generatedAt = new Date();

        return sendSuccess(
            res,
            { dashboard: result },
            "Dashboard fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};
