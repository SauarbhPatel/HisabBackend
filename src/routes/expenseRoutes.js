const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
    getExpenses,
    getByCategory,
    getExpense,
    createExpense,
    updateExpense,
    deleteExpense,
    getMonthlyReport,
} = require("../controllers/expenseController");

router.use(protect);

// ════════════════════════════════════════════════════════════════
//  EXPENSES
// ════════════════════════════════════════════════════════════════

/**
 * @swagger
 * tags:
 *   name: Expenses
 *   description: Personal Expense Tracking
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Expense:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664abc123def456"
 *         owner:
 *           type: string
 *           example: "664user123"
 *         amount:
 *           type: number
 *           example: 680
 *         category:
 *           type: string
 *           enum: [food, travel, bills, entertainment, shopping, health, education, fashion, rent, medical, gifts, drinks, fuel, recharge, trip, other]
 *           example: food
 *         description:
 *           type: string
 *           example: "Domino's Pizza"
 *         date:
 *           type: string
 *           format: date-time
 *           example: "2026-03-22T00:00:00.000Z"
 *         paidVia:
 *           type: string
 *           enum: [upi, cash, card, bank, other]
 *           example: upi
 *         splitType:
 *           type: string
 *           enum: [solo, group, friend]
 *           example: solo
 *         monthKey:
 *           type: string
 *           example: "2026-03"
 *         note:
 *           type: string
 *           example: "Split with Priya"
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     CategoryMeta:
 *       type: object
 *       properties:
 *         total:
 *           type: number
 *           example: 3200
 *         count:
 *           type: integer
 *           example: 8
 *         icon:
 *           type: string
 *           example: "🍕"
 *         label:
 *           type: string
 *           example: "Food & Drinks"
 *
 *     ExpenseListResponse:
 *       type: object
 *       properties:
 *         monthKey:
 *           type: string
 *           example: "2026-03"
 *         totalAmount:
 *           type: number
 *           example: 8940
 *         count:
 *           type: integer
 *           example: 23
 *         byCategory:
 *           type: object
 *           description: All 16 categories always present (0 if no entries)
 *           additionalProperties:
 *             $ref: '#/components/schemas/CategoryMeta'
 *           example:
 *             food:    { total: 3200, count: 8, icon: "🍕", label: "Food & Drinks" }
 *             travel:  { total: 1850, count: 6, icon: "🚌", label: "Travel" }
 *             bills:   { total: 2400, count: 3, icon: "⚡", label: "Bills & Utilities" }
 *         expenses:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Expense'
 */

// ────────────────────────────────────────────────────────────────
//  GET /api/expenses
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/expenses:
 *   get:
 *     summary: Get monthly expenses with category breakdown
 *     description: |
 *       Returns all expenses for a given month with per-category totals.
 *       All 16 categories are always present in `byCategory` (with 0 if no entries that month).
 *       This powers the main Expenses screen in the app.
 *     tags: [Expenses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           example: "2026-03"
 *         description: Month in YYYY-MM format. Defaults to current month.
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [food, travel, bills, entertainment, shopping, health, education, fashion, rent, medical, gifts, drinks, fuel, recharge, trip, other]
 *         description: Filter by a single category. Returns only that category in byCategory.
 *       - in: query
 *         name: splitType
 *         schema:
 *           type: string
 *           enum: [solo, group, friend]
 *         description: Filter by split type.
 *     responses:
 *       200:
 *         description: Expenses fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Expenses fetched successfully." }
 *                 data:
 *                   $ref: '#/components/schemas/ExpenseListResponse'
 *             examples:
 *               all_categories:
 *                 summary: Full monthly breakdown (no filters)
 *                 value:
 *                   response:
 *                     response_code: "200"
 *                     response_message: "Expenses fetched successfully."
 *                   data:
 *                     monthKey: "2026-03"
 *                     totalAmount: 8940
 *                     count: 23
 *                     byCategory:
 *                       food:    { total: 3200, count: 8, icon: "🍕", label: "Food & Drinks" }
 *                       travel:  { total: 1850, count: 6, icon: "🚌", label: "Travel" }
 *                       bills:   { total: 2400, count: 3, icon: "⚡", label: "Bills & Utilities" }
 *                       fashion: { total: 1990, count: 1, icon: "👗", label: "Fashion & Clothing" }
 *                       fuel:    { total: 0,    count: 0, icon: "⛽", label: "Fuel" }
 *                     expenses: []
 *               filtered_category:
 *                 summary: Filtered by category=food
 *                 value:
 *                   response:
 *                     response_code: "200"
 *                     response_message: "Expenses fetched successfully."
 *                   data:
 *                     monthKey: "2026-03"
 *                     totalAmount: 3200
 *                     count: 8
 *                     byCategory:
 *                       food: { total: 3200, count: 8, icon: "🍕", label: "Food & Drinks" }
 *                     expenses: []
 */
router.get("/", getExpenses);

// ────────────────────────────────────────────────────────────────
//  POST /api/expenses
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/expenses:
 *   post:
 *     summary: Add a new personal expense
 *     description: |
 *       Creates a new expense. `monthKey` is auto-calculated from `date`.
 *       Optionally link to a group (`group`) or split with friends (`splitWith`).
 *       If `group` is provided, the user must be a member of that group.
 *       All user IDs in `splitWith` must be valid active users.
 *     tags: [Expenses]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 680
 *                 description: Must be a positive number
 *               category:
 *                 type: string
 *                 enum: [food, travel, bills, entertainment, shopping, health, education, fashion, rent, medical, gifts, drinks, fuel, recharge, trip, other]
 *                 default: other
 *                 example: food
 *               description:
 *                 type: string
 *                 example: "Domino's Pizza"
 *                 maxLength: 200
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-22"
 *                 description: Defaults to today if not provided
 *               paidVia:
 *                 type: string
 *                 enum: [upi, cash, card, bank, other]
 *                 default: cash
 *                 example: upi
 *               splitType:
 *                 type: string
 *                 enum: [solo, group, friend]
 *                 default: solo
 *                 example: solo
 *               splitWith:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of User IDs to split with (must be valid active users)
 *                 example: ["664user1", "664user2"]
 *               group:
 *                 type: string
 *                 description: Group ID (user must be a member of this group)
 *                 example: "664grp123"
 *               note:
 *                 type: string
 *                 example: "Split with Priya and Amit"
 *           examples:
 *             solo_expense:
 *               summary: Solo personal expense
 *               value:
 *                 amount: 360
 *                 category: fuel
 *                 description: "Petrol fill-up"
 *                 date: "2026-03-22"
 *                 paidVia: upi
 *                 splitType: solo
 *             split_with_friends:
 *               summary: Expense split with friends
 *               value:
 *                 amount: 680
 *                 category: food
 *                 description: "Domino's Pizza"
 *                 date: "2026-03-22"
 *                 paidVia: upi
 *                 splitType: friend
 *                 splitWith: ["664user1", "664user2"]
 *                 note: "Split with Priya, Amit"
 *             group_expense:
 *               summary: Expense linked to a group
 *               value:
 *                 amount: 1200
 *                 category: bills
 *                 description: "Electricity Bill"
 *                 date: "2026-03-18"
 *                 paidVia: upi
 *                 splitType: group
 *                 group: "664grp123"
 *     responses:
 *       200:
 *         description: Expense added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Expense added successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     expense:
 *                       $ref: '#/components/schemas/Expense'
 */
router.post("/", createExpense);

// ────────────────────────────────────────────────────────────────
//  GET /api/expenses/report/monthly
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/expenses/report/monthly:
 *   get:
 *     summary: Get monthly expense report for last N months
 *     description: |
 *       Returns a breakdown of expenses for the last N months (max 24).
 *       Each month includes total, count, and per-category breakdown with icons.
 *       All 16 categories are always included per month (0 if no entries).
 *       Powers the Reports screen charts in the app.
 *     tags: [Expenses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           default: 6
 *           minimum: 1
 *           maximum: 24
 *         description: Number of past months to include (max 24). Defaults to 6.
 *         example: 6
 *     responses:
 *       200:
 *         description: Monthly report fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Monthly report fetched successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     months:
 *                       type: integer
 *                       example: 6
 *                     monthKeys:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["2026-03", "2026-02", "2026-01", "2025-12", "2025-11", "2025-10"]
 *                     report:
 *                       type: object
 *                       description: Keyed by YYYY-MM
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           total:
 *                             type: number
 *                             example: 8940
 *                           count:
 *                             type: integer
 *                             example: 23
 *                           byCategory:
 *                             type: object
 *                             additionalProperties:
 *                               $ref: '#/components/schemas/CategoryMeta'
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Monthly report fetched successfully."
 *               data:
 *                 months: 3
 *                 monthKeys: ["2026-03", "2026-02", "2026-01"]
 *                 report:
 *                   "2026-03":
 *                     total: 8940
 *                     count: 23
 *                     byCategory:
 *                       food:   { total: 3200, count: 8, icon: "🍕", label: "Food & Drinks" }
 *                       travel: { total: 1850, count: 6, icon: "🚌", label: "Travel" }
 *                       bills:  { total: 2400, count: 3, icon: "⚡", label: "Bills & Utilities" }
 *                   "2026-02":
 *                     total: 7900
 *                     count: 19
 *                     byCategory:
 *                       food:   { total: 2800, count: 7, icon: "🍕", label: "Food & Drinks" }
 *                       travel: { total: 1200, count: 4, icon: "🚌", label: "Travel" }
 */
router.get("/report/monthly", getMonthlyReport);

// ────────────────────────────────────────────────────────────────
//  GET /api/expenses/category/:category
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/expenses/category/{category}:
 *   get:
 *     summary: Get all entries for a specific category in a month
 *     description: |
 *       Drill-down view for a single category.
 *       Powers the expense detail overlay in the app when a user taps a category row.
 *     tags: [Expenses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [food, travel, bills, entertainment, shopping, health, education, fashion, rent, medical, gifts, drinks, fuel, recharge, trip, other]
 *         example: food
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           example: "2026-03"
 *         description: Month in YYYY-MM format. Defaults to current month.
 *     responses:
 *       200:
 *         description: Category expenses fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Category expenses fetched successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     category:
 *                       type: string
 *                       example: food
 *                     icon:
 *                       type: string
 *                       example: "🍕"
 *                     label:
 *                       type: string
 *                       example: "Food & Drinks"
 *                     monthKey:
 *                       type: string
 *                       example: "2026-03"
 *                     total:
 *                       type: number
 *                       example: 3200
 *                     count:
 *                       type: integer
 *                       example: 8
 *                     expenses:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Expense'
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Category expenses fetched successfully."
 *               data:
 *                 category: food
 *                 icon: "🍕"
 *                 label: "Food & Drinks"
 *                 monthKey: "2026-03"
 *                 total: 3200
 *                 count: 3
 *                 expenses:
 *                   - _id: "664abc1"
 *                     amount: 680
 *                     category: food
 *                     description: "Domino's Pizza"
 *                     date: "2026-03-22T00:00:00.000Z"
 *                     paidVia: cash
 *                     splitType: solo
 *                     monthKey: "2026-03"
 *                   - _id: "664abc2"
 *                     amount: 500
 *                     category: food
 *                     description: "Beer"
 *                     date: "2026-03-11T00:00:00.000Z"
 *                     paidVia: cash
 *                     splitType: solo
 *                     monthKey: "2026-03"
 *       200_error:
 *         description: Invalid category
 *         content:
 *           application/json:
 *             example:
 *               response:
 *                 response_code: "400"
 *                 response_message: "Invalid category. Valid: food, travel, bills, ..."
 *               data: null
 */
router.get("/category/:category", getByCategory);

// ────────────────────────────────────────────────────────────────
//  GET /api/expenses/:id
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/expenses/{id}:
 *   get:
 *     summary: Get a single expense by ID
 *     tags: [Expenses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Expense document ID
 *         example: "664abc123def456"
 *     responses:
 *       200:
 *         description: Expense fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Expense fetched successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     expense:
 *                       $ref: '#/components/schemas/Expense'
 *       200_not_found:
 *         description: Expense not found
 *         content:
 *           application/json:
 *             example:
 *               response:
 *                 response_code: "404"
 *                 response_message: "Expense not found."
 *               data: null
 */
router.get("/:id", getExpense);

// ────────────────────────────────────────────────────────────────
//  PATCH /api/expenses/:id
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/expenses/{id}:
 *   patch:
 *     summary: Update an existing expense
 *     description: |
 *       Updates any fields on an expense. All fields are optional.
 *       **Important:** If `date` is changed, `monthKey` is automatically
 *       recalculated so the expense appears in the correct month's report.
 *       Only the owner of the expense can update it.
 *     tags: [Expenses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "664abc123def456"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 750
 *               category:
 *                 type: string
 *                 enum: [food, travel, bills, entertainment, shopping, health, education, fashion, rent, medical, gifts, drinks, fuel, recharge, trip, other]
 *                 example: food
 *               description:
 *                 type: string
 *                 example: "Updated description"
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-25"
 *                 description: Changing this auto-recalculates monthKey
 *               paidVia:
 *                 type: string
 *                 enum: [upi, cash, card, bank, other]
 *                 example: cash
 *               splitType:
 *                 type: string
 *                 enum: [solo, group, friend]
 *                 example: solo
 *               note:
 *                 type: string
 *                 example: "Updated note"
 *           examples:
 *             update_amount:
 *               summary: Update only the amount
 *               value:
 *                 amount: 750
 *             update_date:
 *               summary: Move expense to different date (monthKey auto-recalculates)
 *               value:
 *                 date: "2026-02-15"
 *             update_multiple:
 *               summary: Update multiple fields
 *               value:
 *                 amount: 900
 *                 category: entertainment
 *                 description: "PVR IMAX Tickets"
 *                 paidVia: card
 *     responses:
 *       200:
 *         description: Expense updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Expense updated successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     expense:
 *                       $ref: '#/components/schemas/Expense'
 *       200_no_fields:
 *         description: No valid fields to update
 *         content:
 *           application/json:
 *             example:
 *               response:
 *                 response_code: "400"
 *                 response_message: "No valid fields provided to update."
 *               data: null
 */
router.patch("/:id", updateExpense);

// ────────────────────────────────────────────────────────────────
//  DELETE /api/expenses/:id
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/expenses/{id}:
 *   delete:
 *     summary: Delete an expense
 *     description: Permanently deletes an expense. Only the owner can delete it.
 *     tags: [Expenses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "664abc123def456"
 *     responses:
 *       200:
 *         description: Expense deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Expense deleted successfully." }
 *                 data:
 *                   type: null
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Expense deleted successfully."
 *               data: null
 *       200_not_found:
 *         description: Expense not found or not yours
 *         content:
 *           application/json:
 *             example:
 *               response:
 *                 response_code: "404"
 *                 response_message: "Expense not found."
 *               data: null
 */
router.delete("/:id", deleteExpense);

module.exports = router;
