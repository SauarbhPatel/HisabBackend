const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
    getGroups,
    getGroup,
    createGroup,
    updateGroup,
    addMember,
    removeMember,
    addExpense,
    deleteExpense,
    settleMember,
    deleteGroup,
} = require("../controllers/groupController");

router.use(protect);

// ════════════════════════════════════════════════════════════════
//  SWAGGER SCHEMAS
// ════════════════════════════════════════════════════════════════

/**
 * @swagger
 * tags:
 *   name: Groups
 *   description: Group Expense Splitting
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     GroupMember:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664mem000001"
 *         user:
 *           type: object
 *           nullable: true
 *           description: Populated user (only if isAppUser is true)
 *           properties:
 *             _id:    { type: string }
 *             name:   { type: string, example: "Priya Kapoor" }
 *             phone:  { type: string, example: "+919876500001" }
 *             avatar: { type: string, example: "😎" }
 *         name:
 *           type: string
 *           nullable: true
 *           description: Name for non-app members
 *           example: "Neha (no app)"
 *         phone:
 *           type: string
 *           nullable: true
 *           example: "+919876500003"
 *         role:
 *           type: string
 *           enum: [admin, member]
 *           example: admin
 *         isAppUser:
 *           type: boolean
 *           example: true
 *         balance:
 *           type: number
 *           description: |
 *             Positive = member is owed money (gets back).
 *             Negative = member owes money.
 *             Zero = settled.
 *           example: -800
 *
 *     GroupExpenseSplit:
 *       type: object
 *       properties:
 *         member:
 *           type: string
 *           nullable: true
 *           description: User ObjectId (null for non-app members)
 *         name:
 *           type: string
 *           nullable: true
 *           description: Name for non-app members
 *         share:
 *           type: number
 *           example: 300
 *         percent:
 *           type: number
 *           nullable: true
 *           description: Only present when splitType is percent
 *           example: 25
 *         settled:
 *           type: boolean
 *           example: false
 *
 *     GroupExpense:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664exp000001"
 *         description:
 *           type: string
 *           example: "Electricity Bill"
 *         amount:
 *           type: number
 *           example: 1200
 *         paidBy:
 *           type: object
 *           description: Populated user
 *           properties:
 *             _id:    { type: string }
 *             name:   { type: string, example: "Priya Kapoor" }
 *             avatar: { type: string, example: "😎" }
 *         date:
 *           type: string
 *           format: date-time
 *         category:
 *           type: string
 *           enum: [food, travel, bills, entertainment, shopping, health, education, fashion, rent, medical, gifts, drinks, fuel, recharge, trip, other]
 *           example: bills
 *         icon:
 *           type: string
 *           description: Emoji icon derived from category (added in response)
 *           example: "⚡"
 *         splitType:
 *           type: string
 *           enum: [equal, percent, custom]
 *           example: equal
 *         splits:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/GroupExpenseSplit'
 *         note:
 *           type: string
 *           example: "March electricity"
 *
 *     Group:
 *       type: object
 *       properties:
 *         _id:           { type: string, example: "664grp000001" }
 *         name:          { type: string, example: "Flat — Koramangala" }
 *         icon:          { type: string, example: "🏠" }
 *         type:          { type: string, enum: [home, trip, work, other], example: home }
 *         memberCount:   { type: integer, example: 4 }
 *         totalExpenses: { type: number, example: 14200 }
 *         lastExpenseDesc: { type: string, example: "Electricity Bill" }
 *         lastExpenseDate: { type: string, format: date-time, nullable: true }
 *         thisMonthCount:  { type: integer, example: 18, description: "Expense count for current month" }
 *         myBalance:
 *           type: number
 *           description: Your balance in this group (negative = you owe)
 *           example: -800
 *         balanceType:
 *           type: string
 *           enum: [owe, lent, settled]
 *           description: Powers the balance badge colour on the group card
 *           example: owe
 *         members:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/GroupMember'
 */

// ────────────────────────────────────────────────────────────────
//  GET /api/groups
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/groups:
 *   get:
 *     summary: List all groups I belong to
 *     description: |
 *       Powers the Groups screen.
 *       Each group includes `myBalance`, `balanceType` (for the badge colour),
 *       `lastExpenseDesc` + `lastExpenseDate` (for "Last: Electricity Bill · Mar 18"),
 *       and `thisMonthCount` (for "18 expenses this month").
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Groups fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Groups fetched successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       example: 4
 *                     groups:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Group'
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Groups fetched successfully."
 *               data:
 *                 count: 4
 *                 groups:
 *                   - _id: "664grp1"
 *                     name: "Flat — Koramangala"
 *                     icon: "🏠"
 *                     type: home
 *                     memberCount: 4
 *                     totalExpenses: 14200
 *                     lastExpenseDesc: "Electricity Bill"
 *                     lastExpenseDate: "2026-03-18T00:00:00.000Z"
 *                     thisMonthCount: 18
 *                     myBalance: -800
 *                     balanceType: owe
 *                   - _id: "664grp2"
 *                     name: "Goa Trip 2025"
 *                     icon: "🎉"
 *                     type: trip
 *                     memberCount: 6
 *                     totalExpenses: 45000
 *                     lastExpenseDesc: "Hotel checkout"
 *                     lastExpenseDate: "2025-01-12T00:00:00.000Z"
 *                     thisMonthCount: 0
 *                     myBalance: 2400
 *                     balanceType: lent
 */
router.get("/", getGroups);

// ────────────────────────────────────────────────────────────────
//  POST /api/groups
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/groups:
 *   post:
 *     summary: Create a new group
 *     description: |
 *       Powers the "Add Group" overlay.
 *       The authenticated user is automatically added as admin.
 *       Use `members[].userId` for app users; `members[].name` + `phone` for non-app members.
 *     tags: [Groups]
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
 *               name:
 *                 type: string
 *                 example: "Flat — Koramangala"
 *               icon:
 *                 type: string
 *                 description: Emoji from the icon picker (🏠 ✈️ 🎉 💼 🍺 🏖️)
 *                 example: "🏠"
 *               type:
 *                 type: string
 *                 enum: [home, trip, work, other]
 *                 example: home
 *               members:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     userId: { type: string, description: "For app users" }
 *                     name:   { type: string, description: "For non-app members" }
 *                     phone:  { type: string }
 *           examples:
 *             home_group:
 *               summary: Create a flat / home group
 *               value:
 *                 name: "Flat — Koramangala"
 *                 icon: "🏠"
 *                 type: home
 *                 members:
 *                   - userId: "664user000002"
 *                   - userId: "664user000003"
 *                   - name: "Neha (no app)"
 *                     phone: "+919876500003"
 *             trip_group:
 *               summary: Create a trip group
 *               value:
 *                 name: "Goa Trip 2026"
 *                 icon: "✈️"
 *                 type: trip
 *                 members:
 *                   - userId: "664user000002"
 *                   - userId: "664user000004"
 *     responses:
 *       200:
 *         description: Group created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     group: { $ref: '#/components/schemas/Group' }
 */
router.post("/", createGroup);

// ────────────────────────────────────────────────────────────────
//  GET /api/groups/:id
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/groups/{id}:
 *   get:
 *     summary: Get full group detail with expense timeline
 *     description: |
 *       Powers the Group Detail overlay.
 *       Returns member balances (sorted: admin first, then by balance),
 *       and expenses sorted newest first with emoji icons.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: "664grp000001"
 *     responses:
 *       200:
 *         description: Group fetched successfully
 *         content:
 *           application/json:
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Group fetched successfully."
 *               data:
 *                 group:
 *                   _id: "664grp1"
 *                   name: "Flat — Koramangala"
 *                   icon: "🏠"
 *                   myBalance: -800
 *                   totalExpenses: 14200
 *                   memberCount: 4
 *                   members:
 *                     - name: "Rahul (You)"
 *                       role: admin
 *                       balance: -800
 *                     - name: "Priya Kapoor"
 *                       role: member
 *                       balance: 2400
 *                   expenses:
 *                     - description: "Electricity Bill"
 *                       amount: 1200
 *                       category: bills
 *                       icon: "⚡"
 *                       splitType: equal
 *                       date: "2026-03-18T00:00:00.000Z"
 *       403:
 *         description: Not a member of this group
 *       404:
 *         description: Group not found
 */
router.get("/:id", getGroup);

// ────────────────────────────────────────────────────────────────
//  PATCH /api/groups/:id
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/groups/{id}:
 *   patch:
 *     summary: Update group name, icon or type (admin only)
 *     tags: [Groups]
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
 *               name: { type: string, example: "Flat — HSR Layout" }
 *               icon: { type: string, example: "🏠" }
 *               type: { type: string, enum: [home, trip, work, other] }
 *     responses:
 *       200:
 *         description: Group updated successfully
 *       403:
 *         description: Only admins can edit the group
 *       404:
 *         description: Group not found
 */
router.patch("/:id", updateGroup);

// ────────────────────────────────────────────────────────────────
//  DELETE /api/groups/:id
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/groups/{id}:
 *   delete:
 *     summary: Archive (soft-delete) a group (admin only)
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Group archived successfully
 *       403:
 *         description: Only admins can delete the group
 *       404:
 *         description: Group not found
 */
router.delete("/:id", deleteGroup);

// ────────────────────────────────────────────────────────────────
//  POST /api/groups/:id/members
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/groups/{id}/members:
 *   post:
 *     summary: Add a member to the group (admin only)
 *     description: |
 *       Powers the "Add Members" section in the group overlay.
 *       Use `userId` for app users; `name` + `phone` for non-app members.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId: { type: string, description: "For app users" }
 *               name:   { type: string, description: "For non-app members" }
 *               phone:  { type: string }
 *           examples:
 *             app_user:
 *               summary: Add an app user
 *               value:
 *                 userId: "664user000005"
 *             non_app:
 *               summary: Add a non-app member
 *               value:
 *                 name: "Sneha (no app)"
 *                 phone: "+919876500009"
 *     responses:
 *       200:
 *         description: Member added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     members:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/GroupMember' }
 *       403:
 *         description: Only admins can add members
 *       409:
 *         description: User already in group
 */
router.post("/:id/members", addMember);

// ────────────────────────────────────────────────────────────────
//  DELETE /api/groups/:id/members/:memberId
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/groups/{id}/members/{memberId}:
 *   delete:
 *     summary: Remove a member from the group (admin only)
 *     description: |
 *       Blocked if the member has an unsettled balance.
 *       Cannot remove the only admin.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema: { type: string }
 *         description: Member subdocument ID
 *     responses:
 *       200:
 *         description: Member removed successfully
 *       400:
 *         description: Cannot remove — unsettled balance or last admin
 *       403:
 *         description: Only admins can remove members
 *       404:
 *         description: Group or member not found
 */
router.delete("/:id/members/:memberId", removeMember);

// ────────────────────────────────────────────────────────────────
//  POST /api/groups/:id/expenses
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/groups/{id}/expenses:
 *   post:
 *     summary: Add an expense to the group
 *     description: |
 *       Powers the "Add Group Expense" overlay.
 *       Supports three split types: equal, percent, custom.
 *       `paidBy` can be any member (prototype has a member selector pill row).
 *       Balances are auto-updated for all members.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [description, amount]
 *             properties:
 *               description:
 *                 type: string
 *                 example: "Electricity Bill"
 *               amount:
 *                 type: number
 *                 example: 1200
 *               paidBy:
 *                 type: string
 *                 description: User ID of the member who paid. Defaults to the authenticated user.
 *                 example: "664user000002"
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-18"
 *               category:
 *                 type: string
 *                 enum: [food, travel, bills, entertainment, shopping, health, education, fashion, rent, medical, gifts, drinks, fuel, recharge, trip, other]
 *                 example: bills
 *               splitType:
 *                 type: string
 *                 enum: [equal, percent, custom]
 *                 default: equal
 *                 example: equal
 *               splits:
 *                 type: array
 *                 description: Required only for percent and custom split types.
 *                 items:
 *                   type: object
 *                   properties:
 *                     member:  { type: string, description: "User ID" }
 *                     name:    { type: string, description: "Name for non-app members" }
 *                     share:   { type: number, description: "Amount (for custom)" }
 *                     percent: { type: number, description: "Percentage (for percent)" }
 *               note:
 *                 type: string
 *                 example: "March electricity"
 *           examples:
 *             equal_split:
 *               summary: Equal split among all members
 *               value:
 *                 description: "Electricity Bill"
 *                 amount: 1200
 *                 paidBy: "664user000002"
 *                 date: "2026-03-18"
 *                 category: bills
 *                 splitType: equal
 *             percent_split:
 *               summary: Percentage-based split
 *               value:
 *                 description: "Rent"
 *                 amount: 20000
 *                 category: rent
 *                 splitType: percent
 *                 splits:
 *                   - member: "664user000001"
 *                     percent: 40
 *                   - member: "664user000002"
 *                     percent: 35
 *                   - member: "664user000003"
 *                     percent: 25
 *             custom_split:
 *               summary: Custom amounts per member
 *               value:
 *                 description: "Groceries"
 *                 amount: 1500
 *                 category: shopping
 *                 splitType: custom
 *                 splits:
 *                   - member: "664user000001"
 *                     share: 700
 *                   - member: "664user000002"
 *                     share: 500
 *                   - name: "Neha (no app)"
 *                     share: 300
 *     responses:
 *       200:
 *         description: Expense added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalExpenses:
 *                       type: number
 *                       example: 15400
 *                     lastExpenseDesc:
 *                       type: string
 *                       example: "Electricity Bill"
 *                     expense:
 *                       $ref: '#/components/schemas/GroupExpense'
 *       400:
 *         description: Validation error (missing fields, splits don't add up, invalid payer)
 *       403:
 *         description: Not a group member
 *       404:
 *         description: Group not found
 */
router.post("/:id/expenses", addExpense);

// ────────────────────────────────────────────────────────────────
//  DELETE /api/groups/:id/expenses/:expenseId
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/groups/{id}/expenses/{expenseId}:
 *   delete:
 *     summary: Delete a group expense
 *     description: |
 *       Removes an expense and **reverses all balance changes** it caused.
 *       Only the original payer or a group admin can delete an expense.
 *       `totalExpenses` and `lastExpenseDesc` are auto-recalculated.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Group ID
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema: { type: string }
 *         description: Expense subdocument ID
 *     responses:
 *       200:
 *         description: Expense deleted and balances reversed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalExpenses:
 *                       type: number
 *                       example: 14200
 *                     lastExpenseDesc:
 *                       type: string
 *                       example: "Monthly Groceries"
 *       403:
 *         description: Only the payer or an admin can delete this expense
 *       404:
 *         description: Group or expense not found
 */
router.delete("/:id/expenses/:expenseId", deleteExpense);

// ────────────────────────────────────────────────────────────────
//  POST /api/groups/:id/settle/:memberId
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/groups/{id}/settle/{memberId}:
 *   post:
 *     summary: Settle a member's balance to ₹0
 *     description: |
 *       Powers the "Settle Up" button in the group detail overlay.
 *       Zeros the member's balance and marks all their expense splits as settled.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema: { type: string }
 *         description: Member subdocument ID
 *     responses:
 *       200:
 *         description: Member settled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     previousBalance:
 *                       type: number
 *                       example: -800
 *                     newBalance:
 *                       type: number
 *                       example: 0
 *       400:
 *         description: Member is already settled
 *       403:
 *         description: Not a group member
 *       404:
 *         description: Group or member not found
 */
router.post("/:id/settle/:memberId", settleMember);

module.exports = router;
