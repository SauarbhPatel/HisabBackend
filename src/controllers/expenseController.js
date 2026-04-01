const Expense = require('../models/Expense');

const CATEGORY_ICONS = {
  food: '🍕', travel: '🚌', bills: '⚡', entertainment: '🎬',
  shopping: '🛒', health: '🏥', education: '📚', fashion: '👗',
  rent: '🏠', medical: '💊', gifts: '🎁', drinks: '🍺',
  fuel: '⛽', recharge: '📱', trip: '✈️', other: '➕',
};

// ─── Helper: build month key ──────────────────────────────────
const toMonthKey = (year, month) =>
  `${year}-${String(month).padStart(2, '0')}`;

// ─────────────────────────────────────────────────────────────
// GET /api/expenses?month=2026-03&category=food
// ─────────────────────────────────────────────────────────────
exports.getExpenses = async (req, res, next) => {
  try {
    const { month, category, splitType } = req.query;
    const filter = { owner: req.user.id };

    // Default to current month if not specified
    const monthKey = month || toMonthKey(
      new Date().getFullYear(),
      new Date().getMonth() + 1
    );
    filter.monthKey = monthKey;

    if (category)  filter.category  = category;
    if (splitType) filter.splitType = splitType;

    const expenses = await Expense.find(filter).sort({ date: -1 });

    // Category breakdown
    const byCategory = {};
    let totalAmount = 0;

    expenses.forEach(e => {
      totalAmount += e.amount;
      if (!byCategory[e.category]) {
        byCategory[e.category] = { total: 0, count: 0, icon: CATEGORY_ICONS[e.category] || '➕' };
      }
      byCategory[e.category].total += e.amount;
      byCategory[e.category].count += 1;
    });

    res.status(200).json({
      success: true,
      monthKey,
      totalAmount,
      count: expenses.length,
      byCategory,
      expenses,
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET /api/expenses/category/:category?month=2026-03
// All entries for one category
// ─────────────────────────────────────────────────────────────
exports.getByCategory = async (req, res, next) => {
  try {
    const { month } = req.query;
    const monthKey  = month || toMonthKey(new Date().getFullYear(), new Date().getMonth() + 1);

    const expenses = await Expense.find({
      owner:    req.user.id,
      category: req.params.category,
      monthKey,
    }).sort({ date: -1 });

    const total = expenses.reduce((s, e) => s + e.amount, 0);

    res.status(200).json({
      success: true,
      category: req.params.category,
      icon:     CATEGORY_ICONS[req.params.category] || '➕',
      monthKey,
      total,
      count: expenses.length,
      expenses,
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET /api/expenses/:id
// ─────────────────────────────────────────────────────────────
exports.getExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findOne({ _id: req.params.id, owner: req.user.id });
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    res.status(200).json({ success: true, expense });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// POST /api/expenses
// ─────────────────────────────────────────────────────────────
exports.createExpense = async (req, res, next) => {
  try {
    const { amount, category, description, date, paidVia, splitType, note } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required.' });
    }

    const expense = await Expense.create({
      owner:       req.user.id,
      amount:      Number(amount),
      category:    category    || 'other',
      description: description || undefined,
      date:        date ? new Date(date) : new Date(),
      paidVia:     paidVia    || 'cash',
      splitType:   splitType  || 'solo',
      note:        note       || undefined,
    });

    res.status(201).json({ success: true, message: 'Expense added.', expense });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/expenses/:id
// ─────────────────────────────────────────────────────────────
exports.updateExpense = async (req, res, next) => {
  try {
    const allowed = ['amount', 'category', 'description', 'date', 'paidVia', 'splitType', 'note'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    if (updates.amount) updates.amount = Number(updates.amount);

    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    res.status(200).json({ success: true, message: 'Expense updated.', expense });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/expenses/:id
// ─────────────────────────────────────────────────────────────
exports.deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    res.status(200).json({ success: true, message: 'Expense deleted.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET /api/expenses/report/monthly?months=6
// Last N months breakdown
// ─────────────────────────────────────────────────────────────
exports.getMonthlyReport = async (req, res, next) => {
  try {
    const months = Math.min(Number(req.query.months) || 6, 24);

    // Build list of last N month keys
    const keys = [];
    const now  = new Date();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(toMonthKey(d.getFullYear(), d.getMonth() + 1));
    }

    const expenses = await Expense.find({
      owner:    req.user.id,
      monthKey: { $in: keys },
    });

    // Group by month
    const report = {};
    keys.forEach(k => { report[k] = { total: 0, byCategory: {} }; });

    expenses.forEach(e => {
      report[e.monthKey].total += e.amount;
      if (!report[e.monthKey].byCategory[e.category]) {
        report[e.monthKey].byCategory[e.category] = 0;
      }
      report[e.monthKey].byCategory[e.category] += e.amount;
    });

    res.status(200).json({ success: true, months: months, report });
  } catch (err) { next(err); }
};
