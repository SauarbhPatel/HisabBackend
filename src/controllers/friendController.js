const Friend = require('../models/Friend');

// ─────────────────────────────────────────────────────────────
// GET /api/friends
// ─────────────────────────────────────────────────────────────
exports.getFriends = async (req, res, next) => {
  try {
    const { filter } = req.query;  // 'owe' | 'owed' | 'settled'
    const query = { owner: req.user.id, isActive: true };

    if (filter === 'owe')     query.balance = { $lt: 0 };
    if (filter === 'owed')    query.balance = { $gt: 0 };
    if (filter === 'settled') query.balance = 0;

    const friends = await Friend.find(query)
      .populate('friend', 'name phone avatar')
      .sort({ updatedAt: -1 });

    const totalOwedToYou = friends.filter(f => f.balance > 0).reduce((s, f) => s + f.balance, 0);
    const totalYouOwe    = friends.filter(f => f.balance < 0).reduce((s, f) => s + Math.abs(f.balance), 0);

    res.status(200).json({
      success: true,
      count: friends.length,
      stats: {
        totalOwedToYou: +totalOwedToYou.toFixed(2),
        totalYouOwe:    +totalYouOwe.toFixed(2),
        netBalance:     +(totalOwedToYou - totalYouOwe).toFixed(2),
      },
      friends,
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// GET /api/friends/:id  — with full transaction history
// ─────────────────────────────────────────────────────────────
exports.getFriend = async (req, res, next) => {
  try {
    const friend = await Friend.findOne({ _id: req.params.id, owner: req.user.id })
      .populate('friend', 'name phone avatar email');
    if (!friend) return res.status(404).json({ success: false, message: 'Friend not found.' });

    // Sort transactions newest first
    friend.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.status(200).json({ success: true, friend });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// POST /api/friends  — add a friend (app user OR external)
// Body: { friendName, friendPhone?, friendEmail?, nickName?, avatarColor? }
//   OR: { friend: userId }  (if they're on the app)
// ─────────────────────────────────────────────────────────────
exports.addFriend = async (req, res, next) => {
  try {
    const { friend, friendName, friendPhone, friendEmail, nickName, avatarColor } = req.body;

    if (!friend && !friendName) {
      return res.status(400).json({ success: false, message: 'friendName (or friend userId) is required.' });
    }

    // Prevent self-friending
    if (friend && friend === req.user.id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot add yourself as a friend.' });
    }

    // Check duplicate
    if (friend) {
      const exists = await Friend.findOne({ owner: req.user.id, friend });
      if (exists) return res.status(409).json({ success: false, message: 'Already added this friend.' });
    }
    if (friendPhone) {
      const exists = await Friend.findOne({ owner: req.user.id, friendPhone });
      if (exists) return res.status(409).json({ success: false, message: 'Friend with this phone already added.' });
    }

    const newFriend = await Friend.create({
      owner:       req.user.id,
      friend:      friend      || undefined,
      friendName:  friendName  || undefined,
      friendPhone: friendPhone || undefined,
      friendEmail: friendEmail || undefined,
      nickName:    nickName    || undefined,
      avatarColor: avatarColor || '#1a7a5e',
    });

    res.status(201).json({ success: true, message: 'Friend added!', friend: newFriend });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// POST /api/friends/:id/transactions
// direction: 'gave' = you paid them | 'received' = they paid you
// Body: { direction, amount, note?, date?, method? }
// ─────────────────────────────────────────────────────────────
exports.addTransaction = async (req, res, next) => {
  try {
    const { direction, amount, note, date, method } = req.body;

    if (!direction || !['gave', 'received'].includes(direction)) {
      return res.status(400).json({ success: false, message: "direction must be 'gave' or 'received'." });
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required.' });
    }

    const friendDoc = await Friend.findOne({ _id: req.params.id, owner: req.user.id });
    if (!friendDoc) return res.status(404).json({ success: false, message: 'Friend not found.' });

    friendDoc.transactions.push({
      direction,
      amount: Number(amount),
      note:   note   || '',
      date:   date ? new Date(date) : new Date(),
      method: method || 'cash',
    });

    await friendDoc.save(); // pre-save recalculates balance

    res.status(201).json({
      success: true,
      message: direction === 'gave' ? 'You gave money recorded.' : 'You received money recorded.',
      balance: +friendDoc.balance.toFixed(2),
      transaction: friendDoc.transactions[friendDoc.transactions.length - 1],
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// POST /api/friends/:id/settle
// Settle the full outstanding balance
// ─────────────────────────────────────────────────────────────
exports.settleUp = async (req, res, next) => {
  try {
    const { method, note } = req.body;

    const friendDoc = await Friend.findOne({ _id: req.params.id, owner: req.user.id });
    if (!friendDoc) return res.status(404).json({ success: false, message: 'Friend not found.' });
    if (friendDoc.balance === 0) {
      return res.status(400).json({ success: false, message: 'Already settled. Balance is ₹0.' });
    }

    // Add settlement transaction to zero out balance
    const direction = friendDoc.balance < 0 ? 'received' : 'gave';
    const amount    = Math.abs(friendDoc.balance);

    friendDoc.transactions.push({
      direction,
      amount,
      note:   note   || 'Settlement',
      date:   new Date(),
      method: method || 'upi',
    });

    await friendDoc.save();

    res.status(200).json({
      success: true,
      message: `Settled! Balance is now ₹0.`,
      balance: 0,
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/friends/:id/transactions/:txId
// ─────────────────────────────────────────────────────────────
exports.deleteTransaction = async (req, res, next) => {
  try {
    const friendDoc = await Friend.findOne({ _id: req.params.id, owner: req.user.id });
    if (!friendDoc) return res.status(404).json({ success: false, message: 'Friend not found.' });

    friendDoc.transactions.pull({ _id: req.params.txId });
    await friendDoc.save();
    res.status(200).json({ success: true, message: 'Transaction deleted.', balance: +friendDoc.balance.toFixed(2) });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/friends/:id
// ─────────────────────────────────────────────────────────────
exports.deleteFriend = async (req, res, next) => {
  try {
    const friendDoc = await Friend.findOne({ _id: req.params.id, owner: req.user.id });
    if (!friendDoc) return res.status(404).json({ success: false, message: 'Friend not found.' });
    if (friendDoc.balance !== 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot remove — unsettled balance of ₹${Math.abs(friendDoc.balance).toFixed(2)}. Settle first.`,
      });
    }
    await friendDoc.deleteOne();
    res.status(200).json({ success: true, message: 'Friend removed.' });
  } catch (err) { next(err); }
};
