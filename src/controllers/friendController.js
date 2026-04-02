const Friend = require('../models/Friend');
const { sendSuccess, sendError } = require('../utils/response');

// GET /api/friends
exports.getFriends = async (req, res, next) => {
  try {
    const { filter } = req.query;
    const query = { owner: req.user.id, isActive: true };

    if (filter === 'owe')     query.balance = { $lt: 0 };
    if (filter === 'owed')    query.balance = { $gt: 0 };
    if (filter === 'settled') query.balance = 0;

    const friends = await Friend.find(query)
      .populate('friend', 'name phone avatar')
      .sort({ updatedAt: -1 });

    const totalOwedToYou = friends.filter(f => f.balance > 0).reduce((s, f) => s + f.balance, 0);
    const totalYouOwe    = friends.filter(f => f.balance < 0).reduce((s, f) => s + Math.abs(f.balance), 0);

    return sendSuccess(res, {
      count: friends.length,
      stats: {
        totalOwedToYou: +totalOwedToYou.toFixed(2),
        totalYouOwe:    +totalYouOwe.toFixed(2),
        netBalance:     +(totalOwedToYou - totalYouOwe).toFixed(2),
      },
      friends,
    }, 'Friends fetched successfully.');
  } catch (err) { next(err); }
};

// GET /api/friends/:id
exports.getFriend = async (req, res, next) => {
  try {
    const friend = await Friend.findOne({ _id: req.params.id, owner: req.user.id })
      .populate('friend', 'name phone avatar email');
    if (!friend) return sendError(res, 'Friend not found.', '404');

    friend.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    return sendSuccess(res, { friend }, 'Friend fetched successfully.');
  } catch (err) { next(err); }
};

// POST /api/friends
exports.addFriend = async (req, res, next) => {
  try {
    const { friend, friendName, friendPhone, friendEmail, nickName, avatarColor } = req.body;

    if (!friend && !friendName)
      return sendError(res, 'friendName (or friend userId) is required.', '400');

    if (friend && friend === req.user.id.toString())
      return sendError(res, 'You cannot add yourself as a friend.', '400');

    if (friend) {
      const exists = await Friend.findOne({ owner: req.user.id, friend });
      if (exists) return sendError(res, 'Already added this friend.', '409');
    }
    if (friendPhone) {
      const exists = await Friend.findOne({ owner: req.user.id, friendPhone });
      if (exists) return sendError(res, 'Friend with this phone already added.', '409');
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

    return sendSuccess(res, { friend: newFriend }, 'Friend added successfully.');
  } catch (err) { next(err); }
};

// POST /api/friends/:id/transactions
exports.addTransaction = async (req, res, next) => {
  try {
    const { direction, amount, note, date, method } = req.body;

    if (!direction || !['gave', 'received'].includes(direction))
      return sendError(res, "direction must be 'gave' or 'received'.", '400');
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
      return sendError(res, 'Valid amount is required.', '400');

    const friendDoc = await Friend.findOne({ _id: req.params.id, owner: req.user.id });
    if (!friendDoc) return sendError(res, 'Friend not found.', '404');

    friendDoc.transactions.push({
      direction,
      amount: Number(amount),
      note:   note   || '',
      date:   date ? new Date(date) : new Date(),
      method: method || 'cash',
    });

    await friendDoc.save();

    return sendSuccess(res, {
      balance:     +friendDoc.balance.toFixed(2),
      transaction: friendDoc.transactions[friendDoc.transactions.length - 1],
    }, direction === 'gave' ? 'You gave money recorded.' : 'You received money recorded.');
  } catch (err) { next(err); }
};

// POST /api/friends/:id/settle
exports.settleUp = async (req, res, next) => {
  try {
    const { method, note } = req.body;

    const friendDoc = await Friend.findOne({ _id: req.params.id, owner: req.user.id });
    if (!friendDoc) return sendError(res, 'Friend not found.', '404');
    if (friendDoc.balance === 0)
      return sendError(res, 'Already settled. Balance is ₹0.', '400');

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

    return sendSuccess(res, { balance: 0 }, 'Settled! Balance is now ₹0.');
  } catch (err) { next(err); }
};

// DELETE /api/friends/:id/transactions/:txId
exports.deleteTransaction = async (req, res, next) => {
  try {
    const friendDoc = await Friend.findOne({ _id: req.params.id, owner: req.user.id });
    if (!friendDoc) return sendError(res, 'Friend not found.', '404');

    friendDoc.transactions.pull({ _id: req.params.txId });
    await friendDoc.save();
    return sendSuccess(res, { balance: +friendDoc.balance.toFixed(2) }, 'Transaction deleted.');
  } catch (err) { next(err); }
};

// DELETE /api/friends/:id
exports.deleteFriend = async (req, res, next) => {
  try {
    const friendDoc = await Friend.findOne({ _id: req.params.id, owner: req.user.id });
    if (!friendDoc) return sendError(res, 'Friend not found.', '404');
    if (friendDoc.balance !== 0)
      return sendError(
        res,
        `Cannot remove — unsettled balance of ₹${Math.abs(friendDoc.balance).toFixed(2)}. Settle first.`,
        '400'
      );

    await friendDoc.deleteOne();
    return sendSuccess(res, null, 'Friend removed successfully.');
  } catch (err) { next(err); }
};
