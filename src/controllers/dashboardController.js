const Expense   = require('../models/Expense');
const Project   = require('../models/Project');
const Friend    = require('../models/Friend');
const Group     = require('../models/Group');
const { sendSuccess, sendError } = require('../utils/response');

// GET /api/dashboard
exports.getDashboard = async (req, res, next) => {
  try {
    const userId   = req.user.id;
    const useCase  = req.user.useCase;
    const now      = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const result = { useCase };

    // ── SPLIT ───────────────────────────────────────────────
    if (useCase === 'split' || useCase === 'both') {
      const [expenses, friends, groups] = await Promise.all([
        Expense.find({ owner: userId, monthKey }),
        Friend.find({ owner: userId, isActive: true }),
        Group.find({ 'members.user': userId, isActive: true }),
      ]);

      const totalSpent   = expenses.reduce((s, e) => s + e.amount, 0);
      const owedToYou    = friends.filter(f => f.balance > 0).reduce((s, f) => s + f.balance, 0);
      const youOwe       = friends.filter(f => f.balance < 0).reduce((s, f) => s + Math.abs(f.balance), 0);
      const activeGroups = groups.length;

      const urgentFriend = friends
        .filter(f => f.balance > 0)
        .sort((a, b) => b.balance - a.balance)[0];

      result.split = {
        monthKey,
        totalSpent:   +totalSpent.toFixed(2),
        owedToYou:    +owedToYou.toFixed(2),
        youOwe:       +youOwe.toFixed(2),
        netBalance:   +(owedToYou - youOwe).toFixed(2),
        activeGroups,
        friendCount:  friends.length,
        urgentFriend: urgentFriend
          ? { name: urgentFriend.friendName, balance: urgentFriend.balance }
          : null,
      };
    }

    // ── FREELANCE ────────────────────────────────────────────
    if (useCase === 'freelance' || useCase === 'both') {
      const projects = await Project.find({ owner: userId, isArchived: false });

      const totalReceived  = projects.reduce((s, p) => s + p.receivedAmount, 0);
      const totalPending   = projects.reduce((s, p) => s + p.pendingAmount, 0);
      const activeProjects = projects.filter(p => p.status === 'inprogress').length;

      let devPayDue = 0;
      projects.forEach(p => {
        p.developers.forEach(d => {
          if (d.status === 'active') devPayDue += (d.agreedAmount - d.paidAmount);
        });
      });

      const urgentProject = projects
        .filter(p => p.pendingAmount > 0)
        .sort((a, b) => b.pendingAmount - a.pendingAmount)[0];

      const thisMonthProjects = projects.filter(p => {
        const d = p.startDate;
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === monthKey;
      });

      result.freelance = {
        totalReceived:   +totalReceived.toFixed(2),
        totalPending:    +totalPending.toFixed(2),
        devPayDue:       +devPayDue.toFixed(2),
        activeProjects,
        totalProjects:   projects.length,
        urgentProject:   urgentProject
          ? { name: urgentProject.name, pending: urgentProject.pendingAmount }
          : null,
        thisMonthIncome: thisMonthProjects.reduce((s, p) => s + p.receivedAmount, 0),
      };
    }

    // ── Recent Activity ──────────────────────────────────────
    const recentExpenses = await Expense.find({ owner: userId })
      .sort({ date: -1 }).limit(5)
      .select('amount category description date paidVia');

    result.recentExpenses = recentExpenses;
    result.generatedAt    = new Date();

    return sendSuccess(res, { dashboard: result }, 'Dashboard fetched successfully.');
  } catch (err) { next(err); }
};
