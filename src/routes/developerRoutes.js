const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
    getDevelopers,
    getDeveloper,
    createDeveloper,
    updateDeveloper,
    deleteDeveloper,
    getDevPaymentHistory,
    recalculateDevStats,
} = require("../controllers/developerController");

router.use(protect);

// ══════════════════════════════════════════════════════════════
//  SWAGGER SCHEMAS (defined once, referenced below)
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * components:
 *   schemas:
 *     Developer:
 *       type: object
 *       properties:
 *         _id:          { type: string, example: "664abc123def456" }
 *         owner:        { type: string, example: "664user000000" }
 *         name:         { type: string, example: "Zafran" }
 *         phone:        { type: string, example: "+919876500001" }
 *         email:        { type: string, example: "zafran@dev.com" }
 *         upiId:        { type: string, example: "zafran@upi" }
 *         role:         { type: string, example: "Frontend Developer" }
 *         notes:        { type: string, example: "Specializes in React, Node.js" }
 *         status:       { type: string, enum: [active, inactive], example: "active" }
 *         totalPaid:    { type: number, example: 16000 }
 *         totalPending: { type: number, example: 3000 }
 *         projectCount: { type: number, example: 4 }
 *         createdAt:    { type: string, format: date-time }
 *         updatedAt:    { type: string, format: date-time }
 *
 *     DeveloperPaymentHistoryEntry:
 *       type: object
 *       properties:
 *         projectId:     { type: string }
 *         project:       { type: string, example: "Flatshare Karo (Development)" }
 *         client:        { type: string, example: "Flatshare Karo" }
 *         projectStatus: { type: string, example: "inprogress" }
 *         amount:        { type: number, example: 2000 }
 *         date:          { type: string, format: date-time }
 *         method:        { type: string, enum: [upi, cash, bank, other], example: "upi" }
 *         note:          { type: string, example: "Milestone 1 payment" }
 *         agreedAmount:  { type: number, example: 7000 }
 *         paidToDate:    { type: number, example: 4000 }
 */

// ══════════════════════════════════════════════════════════════
//  LIST DEVELOPERS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/developers:
 *   get:
 *     summary: List all developers / team members
 *     tags: [Developers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *         description: Filter by role (partial match, case-insensitive). e.g. "Frontend"
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive] }
 *         description: Filter by developer status
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search across name, phone, email, role
 *     responses:
 *       200:
 *         description: Developers fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     count:      { type: integer, example: 4 }
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalPaid:    { type: number, example: 22500 }
 *                         totalPending: { type: number, example: 7000 }
 *                     developers:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Developer' }
 */
router.get("/", getDevelopers);

// ══════════════════════════════════════════════════════════════
//  CREATE DEVELOPER
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/developers:
 *   post:
 *     summary: Add a new developer / team member
 *     tags: [Developers]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:  { type: string, example: "Zafran", description: "Min 2 chars" }
 *               phone: { type: string, example: "9876500001" }
 *               email: { type: string, example: "zafran@dev.com" }
 *               upiId: { type: string, example: "zafran@upi" }
 *               role:  { type: string, example: "Frontend Developer" }
 *               notes: { type: string, example: "Specializes in React, Node.js" }
 *     responses:
 *       200:
 *         description: Developer added successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     developer: { $ref: '#/components/schemas/Developer' }
 *       409:
 *         description: Developer with this phone or email already exists
 */
router.post("/", createDeveloper);

// ══════════════════════════════════════════════════════════════
//  GET SINGLE DEVELOPER
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/developers/{id}:
 *   get:
 *     summary: Get a developer with their project assignments
 *     tags: [Developers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Developer ID
 *     responses:
 *       200:
 *         description: Developer fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     developer: { $ref: '#/components/schemas/Developer' }
 *                     projects:
 *                       type: array
 *                       description: Projects this developer is assigned to with slot details
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:          { type: string }
 *                           name:         { type: string }
 *                           client:       { type: string }
 *                           status:       { type: string }
 *                           role:         { type: string }
 *                           agreedAmount: { type: number }
 *                           paidAmount:   { type: number }
 *                           pending:      { type: number }
 *                           devStatus:    { type: string, enum: [active, paused, removed] }
 *                           payments:     { type: array }
 *       404:
 *         description: Developer not found
 */
router.get("/:id", getDeveloper);

// ══════════════════════════════════════════════════════════════
//  UPDATE DEVELOPER
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/developers/{id}:
 *   patch:
 *     summary: Update developer details or status
 *     tags: [Developers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:   { type: string, example: "Zafran Ahmed" }
 *               phone:  { type: string, example: "9876500001" }
 *               email:  { type: string, example: "zafran@dev.com" }
 *               upiId:  { type: string, example: "zafran@upi" }
 *               role:   { type: string, example: "Full Stack Developer" }
 *               notes:  { type: string }
 *               status: { type: string, enum: [active, inactive] }
 *     responses:
 *       200:
 *         description: Developer updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     developer: { $ref: '#/components/schemas/Developer' }
 *       404:
 *         description: Developer not found
 *       409:
 *         description: Phone or email conflict with another developer
 */
router.patch("/:id", updateDeveloper);

// ══════════════════════════════════════════════════════════════
//  DELETE DEVELOPER
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/developers/{id}:
 *   delete:
 *     summary: Remove a developer (blocked if active on an in-progress project)
 *     tags: [Developers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Developer removed successfully
 *       400:
 *         description: Cannot delete — developer is active on a project. Pause them first.
 *       404:
 *         description: Developer not found
 */
router.delete("/:id", deleteDeveloper);

// ══════════════════════════════════════════════════════════════
//  PAYMENT HISTORY
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/developers/{id}/payment-history:
 *   get:
 *     summary: Full cross-project payment history for a developer
 *     tags: [Developers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Payment history fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     developer:
 *                       type: object
 *                       properties:
 *                         id:    { type: string }
 *                         name:  { type: string }
 *                         role:  { type: string }
 *                         upiId: { type: string }
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalPaid:    { type: number, example: 16000 }
 *                         totalPending: { type: number, example: 3000 }
 *                         projectCount: { type: integer, example: 4 }
 *                     history:
 *                       type: array
 *                       description: All payments across all projects, sorted newest first
 *                       items: { $ref: '#/components/schemas/DeveloperPaymentHistoryEntry' }
 *       404:
 *         description: Developer not found
 */
router.get("/:id/payment-history", getDevPaymentHistory);

// ══════════════════════════════════════════════════════════════
//  RECALCULATE STATS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/developers/{id}/recalculate:
 *   post:
 *     summary: Force-recalculate totalPaid, totalPending, projectCount from live project data
 *     description: |
 *       Useful after bulk data corrections or if the cached stats on the Developer
 *       document have drifted out of sync with actual project payment records.
 *       The projectController automatically calls this after every payment, so
 *       manual calls are rarely needed in normal operation.
 *     tags: [Developers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Stats recalculated and persisted
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     developer:
 *                       type: object
 *                       properties:
 *                         id:           { type: string }
 *                         name:         { type: string }
 *                         totalPaid:    { type: number }
 *                         totalPending: { type: number }
 *                         projectCount: { type: integer }
 *       404:
 *         description: Developer not found
 */
router.post("/:id/recalculate", recalculateDevStats);

module.exports = router;
