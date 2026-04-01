const mongoose = require('mongoose');

// ─── Group expense entry ──────────────────────────────────────
const groupExpenseSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  amount:      { type: Number, required: true, min: 0.01 },
  paidBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:        { type: Date, default: Date.now },
  category:    { type: String, default: 'other' },
  splitType:   { type: String, enum: ['equal', 'percent', 'custom'], default: 'equal' },
  // Each member's share
  splits: [{
    member:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name:    { type: String },                        // for non-app members
    share:   { type: Number, required: true },
    settled: { type: Boolean, default: false },
  }],
  note: { type: String, trim: true },
}, { timestamps: true });

// ─── Group Schema ─────────────────────────────────────────────
const groupSchema = new mongoose.Schema({
  name:    { type: String, required: [true, 'Group name is required'], trim: true, maxlength: 80 },
  icon:    { type: String, default: '👥' },
  type:    { type: String, enum: ['home', 'trip', 'work', 'other'], default: 'other' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  members: [{
    user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name:      { type: String, trim: true },          // for non-app members
    phone:     { type: String, trim: true },
    role:      { type: String, enum: ['admin', 'member'], default: 'member' },
    isAppUser: { type: Boolean, default: true },
    balance:   { type: Number, default: 0 },          // net balance in this group
  }],

  expenses: [groupExpenseSchema],

  totalExpenses: { type: Number, default: 0 },
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });

// ─── Auto-update totalExpenses ────────────────────────────────
groupSchema.pre('save', function (next) {
  if (this.isModified('expenses')) {
    this.totalExpenses = this.expenses.reduce((s, e) => s + e.amount, 0);
  }
  next();
});

// ─── Index: fast lookup by member ────────────────────────────
groupSchema.index({ 'members.user': 1 });

module.exports = mongoose.model('Group', groupSchema);
