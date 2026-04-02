const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getFriends, getFriend, addFriend,
  addTransaction, settleUp,
  deleteTransaction, deleteFriend,
} = require('../controllers/friendController');

router.use(protect);

router.get   ('/',                        getFriends);
router.post  ('/',                        addFriend);
router.get   ('/:id',                     getFriend);
router.delete('/:id',                     deleteFriend);

// Transactions
router.post  ('/:id/transactions',        addTransaction);
router.delete('/:id/transactions/:txId',  deleteTransaction);

// Settle up
router.post  ('/:id/settle',              settleUp);

module.exports = router;
