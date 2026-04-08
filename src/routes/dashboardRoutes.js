const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getDashboard } = require("../controllers/dashboardController");

router.use(protect);

// ══════════════════════════════════════════════════════════════
//  SWAGGER SCHEMAS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * components:
 *   schemas:
 *     UrgentFriend:
 *       type: object
 *       nullable: true
 *       properties:
 *         name:        { type: string, example: "Sneha" }
 *         balance:     { type: number, example: 2990 }
 *         daysPending: { type: integer, example: 8, description: "Days since last transaction" }
 *
 *     UrgentProject:
 *       type: object
 *       nullable: true
 *       properties:
 *         name:          { type: string, example: "School ERP (March)" }
 *         pendingAmount: { type: number, example: 10000 }
 *         client:        { type: string, example: "School ERP Client" }
 *
 *     RecentExpense:
 *       type: object
 *       properties:
 *         _id:         { type: string }
 *         amount:      { type: number, example: 680 }
 *         category:    { type: string, example: "food" }
 *         description: { type: string, example: "Domino's Pizza" }
 *         date:        { type: string, format: date-time }
 *         splitType:   { type: string, enum: [solo, group, friend] }
 *
 *     RecentProjectActivity:
 *       type: object
 *       properties:
 *         type:      { type: string, enum: [client_payment, dev_payment] }
 *         label:     { type: string, example: "School ERP — Client Payment" }
 *         amount:    { type: number, example: 10000 }
 *         date:      { type: string, format: date-time }
 *         direction: { type: string, enum: [in, out], description: "in = received, out = paid" }
 *         project:   { type: string }
 *         client:    { type: string, nullable: true }
 *
 *     MonthPoint:
 *       type: object
 *       properties:
 *         monthKey: { type: string, example: "2026-03" }
 *         total:    { type: number, example: 8940 }
 *
 *     MonthCount:
 *       type: object
 *       properties:
 *         monthKey: { type: string, example: "2026-03" }
 *         count:    { type: integer, example: 3 }
 *
 *     DashboardSplit:
 *       type: object
 *       description: Data for split mode home screen
 *       properties:
 *         monthKey:          { type: string, example: "2026-03" }
 *         totalSpent:        { type: number, example: 8940 }
 *         prevSpent:         { type: number, example: 7900 }
 *         spentChangePct:    { type: integer, example: 12, description: "% change vs prev month. null if no prev data." }
 *         owedToYou:         { type: number, example: 5440 }
 *         youOwe:            { type: number, example: 3200 }
 *         netBalance:        { type: number, example: 2240 }
 *         activeGroups:      { type: integer, example: 4 }
 *         groupExpenseCount: { type: integer, example: 18, description: "This month's group expenses" }
 *         friendCount:       { type: integer, example: 4 }
 *         urgentFriend:      { $ref: '#/components/schemas/UrgentFriend' }
 *         recentExpenses:
 *           type: array
 *           items: { $ref: '#/components/schemas/RecentExpense' }
 *
 *     DashboardFreelance:
 *       type: object
 *       description: Data for freelance mode home screen
 *       properties:
 *         monthKey:           { type: string, example: "2026-03" }
 *         totalProjectIncome: { type: number, example: 34000 }
 *         clientPending:      { type: number, example: 10000 }
 *         devPayDue:          { type: number, example: 9000 }
 *         devPayDueCount:     { type: integer, example: 2, description: "Number of devs with outstanding pay" }
 *         activeProjectCount: { type: integer, example: 3 }
 *         totalProjects:      { type: integer, example: 7 }
 *         clientCount:        { type: integer, example: 3 }
 *         thisMonthIncome:    { type: number, example: 10000 }
 *         urgentProject:      { $ref: '#/components/schemas/UrgentProject' }
 *         recentActivity:
 *           type: array
 *           items: { $ref: '#/components/schemas/RecentProjectActivity' }
 *
 *     MiniCharts:
 *       type: object
 *       description: 7-month sparkline data for the BOTH mode mini chart widgets
 *       properties:
 *         spentByMonth:
 *           type: array
 *           items: { $ref: '#/components/schemas/MonthPoint' }
 *         incomeByMonth:
 *           type: array
 *           items: { $ref: '#/components/schemas/MonthPoint' }
 *         projectsByMonth:
 *           type: array
 *           items: { $ref: '#/components/schemas/MonthCount' }
 *
 *     Dashboard:
 *       type: object
 *       properties:
 *         useCase:    { type: string, enum: [split, freelance, both] }
 *         monthKey:   { type: string, example: "2026-03" }
 *         split:
 *           $ref: '#/components/schemas/DashboardSplit'
 *           description: Present only when useCase is split or both
 *         freelance:
 *           $ref: '#/components/schemas/DashboardFreelance'
 *           description: Present only when useCase is freelance or both
 *         miniCharts:
 *           $ref: '#/components/schemas/MiniCharts'
 *           description: Present only when useCase is both
 *         generatedAt: { type: string, format: date-time }
 */

// ══════════════════════════════════════════════════════════════
//  GET /api/dashboard
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/dashboard:
 *   get:
 *     summary: Home screen data for all three useCase modes
 *     description: |
 *       Single endpoint that powers the entire home screen.
 *       The response shape depends on the authenticated user's `useCase`:
 *
 *       - **`split`** — Returns `split` block:
 *         totalSpent, owedToYou, youOwe, netBalance, activeGroups,
 *         groupExpenseCount, urgentFriend (⚠️ banner), recentExpenses,
 *         spentChangePct (↑ 12% vs Feb).
 *
 *       - **`freelance`** — Returns `freelance` block:
 *         totalProjectIncome, clientPending, devPayDue, devPayDueCount,
 *         activeProjectCount, clientCount, urgentProject (⚠️ banner),
 *         recentActivity (mixed project income + dev payments).
 *
 *       - **`both`** — Returns **both** blocks plus `miniCharts`:
 *         7-month sparklines for the three mini chart widgets
 *         (SPENT / INCOME / PROJECTS counts).
 *
 *     tags: [Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Dashboard fetched successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     dashboard: { $ref: '#/components/schemas/Dashboard' }
 *             examples:
 *               split_mode:
 *                 summary: useCase = split
 *                 value:
 *                   response:
 *                     response_code: "200"
 *                     response_message: "Dashboard fetched successfully."
 *                   data:
 *                     dashboard:
 *                       useCase: split
 *                       monthKey: "2026-03"
 *                       split:
 *                         totalSpent: 8940
 *                         prevSpent: 7900
 *                         spentChangePct: 12
 *                         owedToYou: 5440
 *                         youOwe: 3200
 *                         netBalance: 2240
 *                         activeGroups: 4
 *                         groupExpenseCount: 18
 *                         friendCount: 4
 *                         urgentFriend:
 *                           name: "Sneha"
 *                           balance: 2990
 *                           daysPending: 8
 *                         recentExpenses: []
 *               freelance_mode:
 *                 summary: useCase = freelance
 *                 value:
 *                   response:
 *                     response_code: "200"
 *                     response_message: "Dashboard fetched successfully."
 *                   data:
 *                     dashboard:
 *                       useCase: freelance
 *                       monthKey: "2026-03"
 *                       freelance:
 *                         totalProjectIncome: 34000
 *                         clientPending: 10000
 *                         devPayDue: 9000
 *                         devPayDueCount: 2
 *                         activeProjectCount: 3
 *                         clientCount: 3
 *                         urgentProject:
 *                           name: "School ERP (March)"
 *                           pendingAmount: 10000
 *                           client: "School ERP Client"
 *                         recentActivity: []
 *               both_mode:
 *                 summary: useCase = both
 *                 value:
 *                   response:
 *                     response_code: "200"
 *                     response_message: "Dashboard fetched successfully."
 *                   data:
 *                     dashboard:
 *                       useCase: both
 *                       monthKey: "2026-03"
 *                       split:
 *                         totalSpent: 8940
 *                         owedToYou: 5440
 *                         youOwe: 3200
 *                       freelance:
 *                         totalProjectIncome: 34000
 *                         clientPending: 10000
 *                         devPayDue: 9000
 *                       miniCharts:
 *                         spentByMonth:
 *                           - monthKey: "2025-09"
 *                             total: 6200
 *                           - monthKey: "2025-10"
 *                             total: 7100
 *                         incomeByMonth:
 *                           - monthKey: "2025-09"
 *                             total: 0
 *                           - monthKey: "2025-10"
 *                             total: 5000
 *                         projectsByMonth:
 *                           - monthKey: "2025-09"
 *                             count: 1
 *                           - monthKey: "2025-10"
 *                             count: 2
 */
router.get("/", getDashboard);

module.exports = router;
