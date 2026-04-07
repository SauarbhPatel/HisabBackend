const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
    getReportSummary,
    getSpendingReport,
    getIncomeReport,
    getFriendsReport,
} = require("../controllers/reportsController");

router.use(protect);

// ══════════════════════════════════════════════════════════════
//  SWAGGER SCHEMAS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * components:
 *   schemas:
 *     CategoryBreakdownItem:
 *       type: object
 *       properties:
 *         icon:     { type: string, example: "🍕" }
 *         label:    { type: string, example: "Food & Drinks" }
 *         total:    { type: number, example: 3200 }
 *         count:    { type: integer, example: 8 }
 *
 *     TopCategory:
 *       type: object
 *       properties:
 *         category: { type: string, example: "food" }
 *         icon:     { type: string, example: "🍕" }
 *         label:    { type: string, example: "Food & Drinks" }
 *         total:    { type: number, example: 3200 }
 *         count:    { type: integer, example: 8 }
 *
 *     IncomeByClient:
 *       type: object
 *       properties:
 *         client: { type: string, example: "School ERP Client" }
 *         total:  { type: number, example: 12500 }
 *
 *     ProjectIncomeEntry:
 *       type: object
 *       properties:
 *         project:  { type: string, example: "School ERP (March)" }
 *         client:   { type: string, example: "School ERP Client" }
 *         amount:   { type: number, example: 10000 }
 *         date:     { type: string, format: date-time }
 *         monthKey: { type: string, example: "2026-03" }
 *         label:    { type: string, example: "Advance Payment" }
 *
 *     ProfitAnalysis:
 *       type: object
 *       properties:
 *         totalIncome:  { type: number, example: 34000 }
 *         totalDevPaid: { type: number, example: 8500 }
 *         netProfit:    { type: number, example: 25500 }
 *
 *     ReportSummary:
 *       type: object
 *       properties:
 *         useCase:  { type: string, enum: [split, freelance, both] }
 *         period:   { type: string, enum: [month, 3months, year] }
 *         monthKeys:
 *           type: array
 *           items: { type: string }
 *           example: ["2026-03", "2026-02", "2026-01"]
 *         split:
 *           type: object
 *           description: Present only when useCase is split or both
 *           properties:
 *             totalSpent:     { type: number, example: 8940 }
 *             byCategory:
 *               type: object
 *               description: All 16 categories always present
 *               additionalProperties: { $ref: '#/components/schemas/CategoryBreakdownItem' }
 *             topCategories:
 *               type: array
 *               description: Top 4 by spend for bar chart
 *               items: { $ref: '#/components/schemas/TopCategory' }
 *             byMonth:
 *               type: array
 *               items: { $ref: '#/components/schemas/MonthPoint' }
 *             friends:
 *               type: object
 *               properties:
 *                 owedToYou:  { type: number, example: 5440 }
 *                 youOwe:     { type: number, example: 3200 }
 *                 netBalance: { type: number, example: 2240 }
 *         freelance:
 *           type: object
 *           description: Present only when useCase is freelance or both
 *           properties:
 *             totalIncome:       { type: number, example: 34000 }
 *             totalDevPaid:      { type: number, example: 8500 }
 *             netProfit:         { type: number, example: 25500 }
 *             byClient:
 *               type: object
 *               additionalProperties: { type: number }
 *               example: { "School ERP Client": 12500, "Flatshare Karo": 11000 }
 *             incomeByClient:
 *               type: array
 *               items: { $ref: '#/components/schemas/IncomeByClient' }
 *             projectIncomeList:
 *               type: array
 *               items: { $ref: '#/components/schemas/ProjectIncomeEntry' }
 *             incomeByMonth:
 *               type: array
 *               items: { $ref: '#/components/schemas/MonthPoint' }
 *             profitAnalysis:
 *               $ref: '#/components/schemas/ProfitAnalysis'
 */

// ══════════════════════════════════════════════════════════════
//  GET /api/reports/summary
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/reports/summary:
 *   get:
 *     summary: Full report for the Reports screen — all three useCase modes
 *     description: |
 *       Single endpoint that powers the entire Reports screen.
 *       Returns different blocks based on the authenticated user's `useCase`.
 *
 *       **Period filter chips in the UI:**
 *       - `month` → This Month (default)
 *       - `3months` → Last 3 Months
 *       - `year` → This Year (last 12 months)
 *
 *       **`split` mode returns:**
 *       - `totalSpent` — for the hero stats bar
 *       - `byCategory` — all 16 categories for the donut chart
 *       - `topCategories` — top 4 for the spending bar chart
 *       - `byMonth` — monthly totals for multi-month views
 *       - `friends` — owedToYou / youOwe / netBalance for the Friends Summary card
 *
 *       **`freelance` mode returns:**
 *       - `totalIncome` + `totalDevPaid` + `netProfit` — for the hero stats
 *       - `projectIncomeList` — individual payment rows in the income card
 *       - `incomeByClient` — sorted array for the Income by Client bar chart
 *       - `incomeByMonth` — monthly totals for multi-month views
 *       - `profitAnalysis` — for the Profit Analysis card
 *
 *       **`both` mode returns all of the above.**
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [month, 3months, year]
 *           default: month
 *         description: |
 *           Time range for the report.
 *           `month` = current month only.
 *           `3months` = last 3 months.
 *           `year` = last 12 months.
 *     responses:
 *       200:
 *         description: Report fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Report fetched successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     report: { $ref: '#/components/schemas/ReportSummary' }
 *             examples:
 *               split_month:
 *                 summary: useCase=split, period=month
 *                 value:
 *                   response: { response_code: "200", response_message: "Report fetched successfully." }
 *                   data:
 *                     report:
 *                       useCase: split
 *                       period: month
 *                       monthKeys: ["2026-03"]
 *                       split:
 *                         totalSpent: 8940
 *                         topCategories:
 *                           - { category: food, icon: "🍕", label: "Food & Drinks", total: 3200, count: 8 }
 *                           - { category: bills, icon: "⚡", label: "Bills & Utilities", total: 2400, count: 3 }
 *                           - { category: travel, icon: "🚌", label: "Travel", total: 1850, count: 6 }
 *                           - { category: entertainment, icon: "🎬", label: "Fun & Entertainment", total: 900, count: 2 }
 *                         friends:
 *                           owedToYou: 5440
 *                           youOwe: 3200
 *                           netBalance: 2240
 *               freelance_month:
 *                 summary: useCase=freelance, period=month
 *                 value:
 *                   response: { response_code: "200", response_message: "Report fetched successfully." }
 *                   data:
 *                     report:
 *                       useCase: freelance
 *                       period: month
 *                       monthKeys: ["2026-03"]
 *                       freelance:
 *                         totalIncome: 34000
 *                         totalDevPaid: 8500
 *                         netProfit: 25500
 *                         projectIncomeList:
 *                           - { project: "School ERP (March)", client: "School ERP Client", amount: 10000, date: "2026-03-20T00:00:00.000Z" }
 *                           - { project: "Flatshare Karo (Dev)", client: "Flatshare Karo", amount: 7000, date: "2026-02-25T00:00:00.000Z" }
 *                         incomeByClient:
 *                           - { client: "School ERP Client", total: 12500 }
 *                           - { client: "Flatshare Karo", total: 11000 }
 *                           - { client: "Maksoft Technologies", total: 5500 }
 *                         profitAnalysis: { totalIncome: 34000, totalDevPaid: 8500, netProfit: 25500 }
 */
router.get("/summary", getReportSummary);

// ══════════════════════════════════════════════════════════════
//  GET /api/reports/spending
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/reports/spending:
 *   get:
 *     summary: Spending breakdown — donut chart + category bars
 *     description: |
 *       Returns spending data for the donut chart and category bar chart
 *       in the split/both Reports screen.
 *       All 16 categories always present in `byCategory` (0 if no spend).
 *       `topCategories` returns the top 4 by spend for the bar chart.
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [month, 3months, year], default: month }
 *     responses:
 *       200:
 *         description: Spending report fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:         { type: string, example: "month" }
 *                     monthKeys:      { type: array, items: { type: string } }
 *                     totalSpent:     { type: number, example: 8940 }
 *                     byCategory:
 *                       type: object
 *                       description: All 16 categories, keyed by category name
 *                       additionalProperties: { $ref: '#/components/schemas/CategoryBreakdownItem' }
 *                     topCategories:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/TopCategory' }
 *                     byMonth:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/MonthPoint' }
 *             example:
 *               data:
 *                 period: month
 *                 monthKeys: ["2026-03"]
 *                 totalSpent: 8940
 *                 topCategories:
 *                   - { category: food, icon: "🍕", label: "Food & Drinks", total: 3200, count: 8 }
 *                   - { category: bills, icon: "⚡", label: "Bills & Utilities", total: 2400, count: 3 }
 *                 byMonth: [{ monthKey: "2026-03", total: 8940 }]
 */
router.get("/spending", getSpendingReport);

// ══════════════════════════════════════════════════════════════
//  GET /api/reports/income
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/reports/income:
 *   get:
 *     summary: Project income — income card + by-client bars + profit card
 *     description: |
 *       Returns project income data for the freelance/both Reports screen.
 *       Powers three cards: the Project Income list card, the Income by Client
 *       bar chart, and the Profit Analysis card.
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [month, 3months, year], default: month }
 *     responses:
 *       200:
 *         description: Income report fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:            { type: string, example: "month" }
 *                     monthKeys:         { type: array, items: { type: string } }
 *                     totalIncome:       { type: number, example: 34000 }
 *                     totalDevPaid:      { type: number, example: 8500 }
 *                     netProfit:         { type: number, example: 25500 }
 *                     byClient:
 *                       type: object
 *                       additionalProperties: { type: number }
 *                       example: { "School ERP Client": 12500, "Flatshare Karo": 11000 }
 *                     incomeByClient:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/IncomeByClient' }
 *                     incomeByMonth:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/MonthPoint' }
 *                     projectIncomeList:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ProjectIncomeEntry' }
 *                     profitAnalysis:
 *                       $ref: '#/components/schemas/ProfitAnalysis'
 *             example:
 *               data:
 *                 period: month
 *                 totalIncome: 34000
 *                 totalDevPaid: 8500
 *                 netProfit: 25500
 *                 incomeByClient:
 *                   - { client: "School ERP Client", total: 12500 }
 *                   - { client: "Flatshare Karo", total: 11000 }
 *                   - { client: "Maksoft Technologies", total: 5500 }
 *                 projectIncomeList:
 *                   - { project: "School ERP (March)", amount: 10000, date: "2026-03-20T00:00:00.000Z" }
 *                 profitAnalysis: { totalIncome: 34000, totalDevPaid: 8500, netProfit: 25500 }
 */
router.get("/income", getIncomeReport);

// ══════════════════════════════════════════════════════════════
//  GET /api/reports/friends
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/reports/friends:
 *   get:
 *     summary: Friends summary — owedToYou, youOwe, netBalance
 *     description: |
 *       Powers the 👥 Friends Summary card in the split/both Reports screen.
 *       Returns current balances across all friends.
 *       No period filter needed — balances are always current.
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Friends report fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     owedToYou:    { type: number, example: 5440 }
 *                     youOwe:       { type: number, example: 3200 }
 *                     netBalance:   { type: number, example: 2240 }
 *                     friendCount:  { type: integer, example: 4 }
 *                     settledCount: { type: integer, example: 1 }
 *                     topOwed:
 *                       type: array
 *                       description: Top 5 friends who owe you (sorted by balance)
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:         { type: string, example: "Neha Verma" }
 *                           balance:      { type: number, example: 4300 }
 *                           expenseCount: { type: integer, example: 7 }
 *             example:
 *               data:
 *                 owedToYou: 5440
 *                 youOwe: 3200
 *                 netBalance: 2240
 *                 friendCount: 4
 *                 settledCount: 1
 *                 topOwed:
 *                   - { name: "Neha Verma", balance: 4300, expenseCount: 7 }
 *                   - { name: "Amit Sharma", balance: 1140, expenseCount: 3 }
 */
router.get("/friends", getFriendsReport);

module.exports = router;
