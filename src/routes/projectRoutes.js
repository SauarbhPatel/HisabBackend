const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getProjects, getProject, createProject, updateProject, deleteProject,
  addClientPayment, updateClientPayment, deleteClientPayment,
  addDevToProject, updateDevStatus, payDeveloper,
  getProjectSummary,
} = require('../controllers/projectController');

router.use(protect); // all project routes require auth

// Projects
router.get   ('/',          getProjects);
router.post  ('/',          createProject);
router.get   ('/summary',   getProjectSummary);
router.get   ('/:id',       getProject);
router.patch ('/:id',       updateProject);
router.delete('/:id',       deleteProject);

// Client Payments
router.post  ('/:id/client-payments',                    addClientPayment);
router.patch ('/:id/client-payments/:paymentId',         updateClientPayment);
router.delete('/:id/client-payments/:paymentId',         deleteClientPayment);

// Developer Assignments
router.post  ('/:id/developers',                         addDevToProject);
router.patch ('/:id/developers/:devId/status',           updateDevStatus);
router.post  ('/:id/developers/:devId/pay',              payDeveloper);

module.exports = router;
