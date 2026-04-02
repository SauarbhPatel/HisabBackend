const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getExpenses, getByCategory, getExpense,
  createExpense, updateExpense, deleteExpense,
  getMonthlyReport,
} = require('../controllers/expenseController');

router.use(protect);

router.get   ('/',                   getExpenses);
router.post  ('/',                   createExpense);
router.get   ('/report/monthly',     getMonthlyReport);
router.get   ('/category/:category', getByCategory);
router.get   ('/:id',                getExpense);
router.patch ('/:id',                updateExpense);
router.delete('/:id',                deleteExpense);

module.exports = router;
