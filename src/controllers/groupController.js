const Group = require('../models/Group');

// ─────────────────────────────────────────────────────────────
// GET /api/groups
// ─────────────────────────────────────────────────────────────
exports.getGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({
      'members.user': req.user.id,
      isActive: true,
    })
      .populate('members.user', 'name phone avatar')
      .sort({ updatedAt: -1 });

    // Attach current user's balance to each group
    const enriched = groups.map(g => {
      const me = g.members.find(m => m.user?._id?.toString() === req.user.id.toString());
      return {
        ...g.toObject(),
        myBalance: me ? me.balance : 0,
      };
    });

    res.status(200).json({ success: true, count: groups.length, groups: enriched });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET /api/groups/:id
// ─────────────────────────────────────────────────────────────
exports.getGroup = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('members.user', 'name phone avatar')
      .populate('expenses.paidBy', 'name');

    if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });

    // Ensure user is a member
    const isMember = group.members.some(m => m.user?._id?.toString() === req.user.id.toString());
    if (!isMember) return res.status(403).json({ success: false, message: 'Not a member of this group.' });

    res.status(200).json({ success: true, group });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// POST /api/groups
// Body: { name, icon?, type?, members: [{userId?, name?, phone?}] }
// ─────────────────────────────────────────────────────────────
exports.createGroup = async (req, res, next) => {
  try {
    const { name, icon, type, members } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Group name (min 2 chars) is required.' });
    }

    // Always include creator as admin
    const memberList = [{
      user:      req.user.id,
      name:      req.user.name,
      role:      'admin',
      isAppUser: true,
      balance:   0,
    }];

    if (members && Array.isArray(members)) {
      members.forEach(m => {
        if (!m.userId && !m.name) return;
        // Don't duplicate creator
        if (m.userId && m.userId === req.user.id.toString()) return;
        memberList.push({
          user:      m.userId || undefined,
          name:      m.name   || undefined,
          phone:     m.phone  || undefined,
          role:      'member',
          isAppUser: !!m.userId,
          balance:   0,
        });
      });
    }

    const group = await Group.create({
      name:      name.trim(),
      icon:      icon || '👥',
      type:      type || 'other',
      createdBy: req.user.id,
      members:   memberList,
    });

    res.status(201).json({ success: true, message: 'Group created!', group });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/groups/:id
// ─────────────────────────────────────────────────────────────
exports.updateGroup = async (req, res, next) => {
  try {
    const { name, icon, type } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });

    const isAdmin = group.members.some(
      m => m.user?.toString() === req.user.id.toString() && m.role === 'admin'
    );
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Only admins can edit the group.' });

    if (name) group.name = name.trim();
    if (icon) group.icon = icon;
    if (type) group.type = type;
    await group.save();

    res.status(200).json({ success: true, message: 'Group updated.', group });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// POST /api/groups/:id/members  — add a member
// ─────────────────────────────────────────────────────────────
exports.addMember = async (req, res, next) => {
  try {
    const { userId, name, phone } = req.body;
    if (!userId && !name) {
      return res.status(400).json({ success: false, message: 'userId or name is required.' });
    }

    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });

    const isAdmin = group.members.some(
      m => m.user?.toString() === req.user.id.toString() && m.role === 'admin'
    );
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Only admins can add members.' });

    // Check duplicate
    if (userId && group.members.some(m => m.user?.toString() === userId)) {
      return res.status(409).json({ success: false, message: 'User already in group.' });
    }

    group.members.push({
      user:      userId || undefined,
      name:      name   || undefined,
      phone:     phone  || undefined,
      role:      'member',
      isAppUser: !!userId,
      balance:   0,
    });
    await group.save();

    res.status(200).json({ success: true, message: 'Member added.', members: group.members });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// POST /api/groups/:id/expenses  — add a group expense
// Body: { description, amount, paidBy?, date?, category?, splitType?, splits? }
// ─────────────────────────────────────────────────────────────
exports.addExpense = async (req, res, next) => {
  try {
    const { description, amount, paidBy, date, category, splitType, splits, note } = req.body;

    if (!description || !amount) {
      return res.status(400).json({ success: false, message: 'description and amount are required.' });
    }
    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'amount must be positive.' });
    }

    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });

    const isMember = group.members.some(m => m.user?.toString() === req.user.id.toString());
    if (!isMember) return res.status(403).json({ success: false, message: 'Not a group member.' });

    const totalAmount = Number(amount);
    const payerId     = paidBy || req.user.id;
    const sType       = splitType || 'equal';

    // ── Calculate splits ──────────────────────────────────────
    let calculatedSplits = [];
    const activeMembers  = group.members;

    if (sType === 'equal') {
      const share = +(totalAmount / activeMembers.length).toFixed(2);
      calculatedSplits = activeMembers.map(m => ({
        member:  m.user,
        name:    m.name,
        share,
        settled: m.user?.toString() === payerId.toString(),
      }));
    } else if (sType === 'custom' && splits && splits.length) {
      // Validate custom splits sum
      const sum = splits.reduce((s, sp) => s + Number(sp.share), 0);
      if (Math.abs(sum - totalAmount) > 1) {
        return res.status(400).json({ success: false, message: `Custom splits (₹${sum}) don't add up to ₹${totalAmount}.` });
      }
      calculatedSplits = splits.map(sp => ({
        member:  sp.member,
        name:    sp.name,
        share:   Number(sp.share),
        settled: sp.member?.toString() === payerId.toString(),
      }));
    }

    group.expenses.push({
      description: description.trim(),
      amount:      totalAmount,
      paidBy:      payerId,
      date:        date ? new Date(date) : new Date(),
      category:    category  || 'other',
      splitType:   sType,
      splits:      calculatedSplits,
      note:        note || '',
    });

    // ── Update member balances ─────────────────────────────────
    calculatedSplits.forEach(sp => {
      const member = group.members.find(m => m.user?.toString() === sp.member?.toString());
      if (!member) return;
      if (sp.member?.toString() === payerId.toString()) {
        // Payer is owed by everyone else
        member.balance += totalAmount - sp.share;
      } else {
        // Non-payer owes
        member.balance -= sp.share;
      }
    });

    await group.save();

    res.status(201).json({
      success: true,
      message: 'Expense added to group.',
      totalExpenses: group.totalExpenses,
      expense: group.expenses[group.expenses.length - 1],
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// POST /api/groups/:id/settle/:memberId
// Mark a member's balance as settled
// ─────────────────────────────────────────────────────────────
exports.settleMember = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });

    const member = group.members.id(req.params.memberId);
    if (!member) return res.status(404).json({ success: false, message: 'Member not found.' });

    const previousBalance = member.balance;
    member.balance        = 0;

    // Also mark their splits as settled
    group.expenses.forEach(exp => {
      exp.splits.forEach(sp => {
        if (sp.member?.toString() === member.user?.toString()) sp.settled = true;
      });
    });

    await group.save();
    res.status(200).json({ success: true, message: 'Member settled.', previousBalance, newBalance: 0 });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/groups/:id
// ─────────────────────────────────────────────────────────────
exports.deleteGroup = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });

    const isAdmin = group.members.some(
      m => m.user?.toString() === req.user.id.toString() && m.role === 'admin'
    );
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Only admins can delete the group.' });

    group.isActive = false;
    await group.save();
    res.status(200).json({ success: true, message: 'Group archived.' });
  } catch (err) { next(err); }
};
