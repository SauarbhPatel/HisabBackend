const Group = require('../models/Group');
const { sendSuccess, sendError } = require('../utils/response');

// GET /api/groups
exports.getGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({
      'members.user': req.user.id,
      isActive: true,
    })
      .populate('members.user', 'name phone avatar')
      .sort({ updatedAt: -1 });

    const enriched = groups.map(g => {
      const me = g.members.find(m => m.user?._id?.toString() === req.user.id.toString());
      return {
        ...g.toObject(),
        myBalance: me ? me.balance : 0,
      };
    });

    return sendSuccess(res, { count: groups.length, groups: enriched }, 'Groups fetched successfully.');
  } catch (err) { next(err); }
};

// GET /api/groups/:id
exports.getGroup = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('members.user', 'name phone avatar')
      .populate('expenses.paidBy', 'name');

    if (!group) return sendError(res, 'Group not found.', '404');

    const isMember = group.members.some(m => m.user?._id?.toString() === req.user.id.toString());
    if (!isMember) return sendError(res, 'Not a member of this group.', '403');

    return sendSuccess(res, { group }, 'Group fetched successfully.');
  } catch (err) { next(err); }
};

// POST /api/groups
exports.createGroup = async (req, res, next) => {
  try {
    const { name, icon, type, members } = req.body;

    if (!name || name.trim().length < 2)
      return sendError(res, 'Group name (min 2 chars) is required.', '400');

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

    return sendSuccess(res, { group }, 'Group created successfully.');
  } catch (err) { next(err); }
};

// PATCH /api/groups/:id
exports.updateGroup = async (req, res, next) => {
  try {
    const { name, icon, type } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) return sendError(res, 'Group not found.', '404');

    const isAdmin = group.members.some(
      m => m.user?.toString() === req.user.id.toString() && m.role === 'admin'
    );
    if (!isAdmin) return sendError(res, 'Only admins can edit the group.', '403');

    if (name) group.name = name.trim();
    if (icon) group.icon = icon;
    if (type) group.type = type;
    await group.save();

    return sendSuccess(res, { group }, 'Group updated successfully.');
  } catch (err) { next(err); }
};

// POST /api/groups/:id/members
exports.addMember = async (req, res, next) => {
  try {
    const { userId, name, phone } = req.body;
    if (!userId && !name)
      return sendError(res, 'userId or name is required.', '400');

    const group = await Group.findById(req.params.id);
    if (!group) return sendError(res, 'Group not found.', '404');

    const isAdmin = group.members.some(
      m => m.user?.toString() === req.user.id.toString() && m.role === 'admin'
    );
    if (!isAdmin) return sendError(res, 'Only admins can add members.', '403');

    if (userId && group.members.some(m => m.user?.toString() === userId))
      return sendError(res, 'User already in group.', '409');

    group.members.push({
      user:      userId || undefined,
      name:      name   || undefined,
      phone:     phone  || undefined,
      role:      'member',
      isAppUser: !!userId,
      balance:   0,
    });
    await group.save();

    return sendSuccess(res, { members: group.members }, 'Member added successfully.');
  } catch (err) { next(err); }
};

// POST /api/groups/:id/expenses
exports.addExpense = async (req, res, next) => {
  try {
    const { description, amount, paidBy, date, category, splitType, splits, note } = req.body;

    if (!description || !amount)
      return sendError(res, 'description and amount are required.', '400');
    if (isNaN(Number(amount)) || Number(amount) <= 0)
      return sendError(res, 'amount must be positive.', '400');

    const group = await Group.findById(req.params.id);
    if (!group) return sendError(res, 'Group not found.', '404');

    const isMember = group.members.some(m => m.user?.toString() === req.user.id.toString());
    if (!isMember) return sendError(res, 'Not a group member.', '403');

    const totalAmount = Number(amount);
    const payerId     = paidBy || req.user.id;
    const sType       = splitType || 'equal';

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
      const sum = splits.reduce((s, sp) => s + Number(sp.share), 0);
      if (Math.abs(sum - totalAmount) > 1)
        return sendError(res, `Custom splits (₹${sum}) don't add up to ₹${totalAmount}.`, '400');

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

    calculatedSplits.forEach(sp => {
      const member = group.members.find(m => m.user?.toString() === sp.member?.toString());
      if (!member) return;
      if (sp.member?.toString() === payerId.toString()) {
        member.balance += totalAmount - sp.share;
      } else {
        member.balance -= sp.share;
      }
    });

    await group.save();

    return sendSuccess(res, {
      totalExpenses: group.totalExpenses,
      expense:       group.expenses[group.expenses.length - 1],
    }, 'Expense added to group successfully.');
  } catch (err) { next(err); }
};

// POST /api/groups/:id/settle/:memberId
exports.settleMember = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return sendError(res, 'Group not found.', '404');

    const member = group.members.id(req.params.memberId);
    if (!member) return sendError(res, 'Member not found.', '404');

    const previousBalance = member.balance;
    member.balance        = 0;

    group.expenses.forEach(exp => {
      exp.splits.forEach(sp => {
        if (sp.member?.toString() === member.user?.toString()) sp.settled = true;
      });
    });

    await group.save();
    return sendSuccess(res, { previousBalance, newBalance: 0 }, 'Member settled successfully.');
  } catch (err) { next(err); }
};

// DELETE /api/groups/:id
exports.deleteGroup = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return sendError(res, 'Group not found.', '404');

    const isAdmin = group.members.some(
      m => m.user?.toString() === req.user.id.toString() && m.role === 'admin'
    );
    if (!isAdmin) return sendError(res, 'Only admins can delete the group.', '403');

    group.isActive = false;
    await group.save();
    return sendSuccess(res, null, 'Group archived successfully.');
  } catch (err) { next(err); }
};
