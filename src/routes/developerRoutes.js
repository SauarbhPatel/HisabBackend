const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getDevelopers, getDeveloper, createDeveloper,
  updateDeveloper, deleteDeveloper, getDevPaymentHistory,
} = require('../controllers/developerController');

router.use(protect);

router.get   ('/',                      getDevelopers);
router.post  ('/',                      createDeveloper);
router.get   ('/:id',                   getDeveloper);
router.patch ('/:id',                   updateDeveloper);
router.delete('/:id',                   deleteDeveloper);
router.get   ('/:id/payment-history',   getDevPaymentHistory);

module.exports = router;
