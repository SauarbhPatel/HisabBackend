const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getGroups, getGroup, createGroup, updateGroup,
  addMember, addExpense, settleMember, deleteGroup,
} = require('../controllers/groupController');

router.use(protect);

router.get   ('/',                          getGroups);
router.post  ('/',                          createGroup);
router.get   ('/:id',                       getGroup);
router.patch ('/:id',                       updateGroup);
router.delete('/:id',                       deleteGroup);

// Members
router.post  ('/:id/members',               addMember);

// Expenses
router.post  ('/:id/expenses',              addExpense);

// Settle
router.post  ('/:id/settle/:memberId',      settleMember);

module.exports = router;
