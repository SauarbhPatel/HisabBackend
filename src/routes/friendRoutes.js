const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
    getFriends,
    getFriend,
    addFriend,
    updateFriend,
    addTransaction,
    settleUp,
    deleteTransaction,
    deleteFriend,
} = require("../controllers/friendController");

router.use(protect);

// ════════════════════════════════════════════════════════════════
//  SWAGGER SCHEMAS
// ════════════════════════════════════════════════════════════════

/**
 * @swagger
 * tags:
 *   name: Friends
 *   description: Friends & Personal Balances (OkCredit style)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Transaction:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664tx000001"
 *         direction:
 *           type: string
 *           enum: [gave, received]
 *           description: |
 *             From the owner's perspective.
 *             `gave` = you paid the friend (balance goes down).
 *             `received` = friend paid you (balance goes up).
 *           example: gave
 *         amount:
 *           type: number
 *           example: 350
 *         note:
 *           type: string
 *           example: "Lunch split"
 *         date:
 *           type: string
 *           format: date-time
 *           example: "2026-03-22T00:00:00.000Z"
 *         method:
 *           type: string
 *           enum: [upi, cash, bank, other]
 *           example: cash
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     Friend:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664frnd000001"
 *         owner:
 *           type: string
 *           example: "664user000001"
 *         friend:
 *           type: object
 *           description: Populated user object (only if friend is an app user)
 *           nullable: true
 *           properties:
 *             _id:         { type: string }
 *             name:        { type: string, example: "Priya Kapoor" }
 *             phone:       { type: string, example: "+919876500001" }
 *             avatar:      { type: string, example: "😎" }
 *             avatarColor: { type: string, example: "#1a7a5e" }
 *         friendName:
 *           type: string
 *           example: "Priya Kapoor"
 *         friendPhone:
 *           type: string
 *           example: "+919876500001"
 *         friendEmail:
 *           type: string
 *           example: "priya@gmail.com"
 *         nickName:
 *           type: string
 *           example: "Priya Di"
 *         avatarColor:
 *           type: string
 *           example: "#1a7a5e"
 *         balance:
 *           type: number
 *           description: |
 *             Positive = friend owes you (shown GREEN — "Owes you ₹X").
 *             Negative = you owe friend (shown RED — "You owe ₹X").
 *             Zero = settled.
 *           example: 4300
 *         expenseCount:
 *           type: integer
 *           description: Total number of transactions with this friend
 *           example: 7
 *         lastTransactionDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         transactions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Transaction'
 *
 *     FriendsStats:
 *       type: object
 *       properties:
 *         totalOwedToYou:
 *           type: number
 *           example: 5440
 *         totalYouOwe:
 *           type: number
 *           example: 3200
 *         netBalance:
 *           type: number
 *           example: 2240
 *         friendCount:
 *           type: integer
 *           example: 4
 */

// ────────────────────────────────────────────────────────────────
//  GET /api/friends
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/friends:
 *   get:
 *     summary: List all friends with balance stats
 *     description: |
 *       Returns all friends with their current balance.
 *       Powers the Friends screen — stats bar at top + friend cards list.
 *       Supports filter chips (All / You Owe / Owed to You / Settled) and search bar.
 *     tags: [Friends]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *           enum: [owe, owed, settled]
 *         description: |
 *           Filter chip selection.
 *           `owe` = friends you owe money to.
 *           `owed` = friends who owe you money.
 *           `settled` = friends with zero balance.
 *           Omit for All (default).
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by friend name, nickname, phone or email.
 *         example: "Priya"
 *     responses:
 *       200:
 *         description: Friends fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Friends fetched successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       example: 4
 *                     stats:
 *                       $ref: '#/components/schemas/FriendsStats'
 *                     friends:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Friend'
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Friends fetched successfully."
 *               data:
 *                 count: 4
 *                 stats:
 *                   totalOwedToYou: 5440
 *                   totalYouOwe: 3200
 *                   netBalance: 2240
 *                   friendCount: 4
 *                 friends:
 *                   - _id: "664frnd1"
 *                     friendName: "Priya Kapoor"
 *                     friendPhone: "+919876500001"
 *                     nickName: null
 *                     avatarColor: "#1a7a5e"
 *                     balance: -210
 *                     expenseCount: 2
 *                   - _id: "664frnd2"
 *                     friendName: "Neha Verma"
 *                     balance: 4300
 *                     expenseCount: 7
 */
router.get("/", getFriends);

// ────────────────────────────────────────────────────────────────
//  POST /api/friends
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/friends:
 *   post:
 *     summary: Add a new friend
 *     description: |
 *       Powers the "Add Friend" overlay.
 *       Use `friend` (userId) for friends who are already on the app.
 *       Use `friendName` + optional phone/email for friends not on the app yet.
 *       `avatarColor` maps to the color picker in the overlay (6 color options).
 *     tags: [Friends]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               friend:
 *                 type: string
 *                 description: User ID if friend is an app user. Mutually exclusive with friendName.
 *                 example: "664user000002"
 *               friendName:
 *                 type: string
 *                 description: Required if friend is not an app user.
 *                 example: "Priya Kapoor"
 *               friendPhone:
 *                 type: string
 *                 example: "+919876500001"
 *               friendEmail:
 *                 type: string
 *                 example: "priya@gmail.com"
 *               nickName:
 *                 type: string
 *                 example: "Priya Di"
 *               avatarColor:
 *                 type: string
 *                 description: Hex colour for the avatar circle.
 *                 example: "#1a7a5e"
 *           examples:
 *             non_app_user:
 *               summary: Add a friend not on the app
 *               value:
 *                 friendName: "Priya Kapoor"
 *                 friendPhone: "+919876500001"
 *                 friendEmail: "priya@gmail.com"
 *                 nickName: "Priya Di"
 *                 avatarColor: "#1a7a5e"
 *             app_user:
 *               summary: Add a friend who is already on the app
 *               value:
 *                 friend: "664user000002"
 *                 avatarColor: "#378add"
 *     responses:
 *       200:
 *         description: Friend added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     friend: { $ref: '#/components/schemas/Friend' }
 *       409:
 *         description: Friend already added (duplicate userId or phone)
 *       400:
 *         description: Missing required fields or tried to add yourself
 */
router.post("/", addFriend);

// ────────────────────────────────────────────────────────────────
//  GET /api/friends/:id
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/friends/{id}:
 *   get:
 *     summary: Get a friend with full transaction history
 *     description: |
 *       Powers the Friend Detail overlay (OkCredit style).
 *       Returns the friend's info, current balance, and all transactions
 *       sorted newest first (You gave ↑ / You received ↓ timeline).
 *     tags: [Friends]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: "664frnd000001"
 *     responses:
 *       200:
 *         description: Friend fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     friend: { $ref: '#/components/schemas/Friend' }
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Friend fetched successfully."
 *               data:
 *                 friend:
 *                   _id: "664frnd1"
 *                   friendName: "Priya Kapoor"
 *                   balance: 4300
 *                   expenseCount: 5
 *                   transactions:
 *                     - direction: gave
 *                       amount: 350
 *                       note: "Lunch split"
 *                       date: "2026-03-22T00:00:00.000Z"
 *                       method: cash
 *                     - direction: received
 *                       amount: 900
 *                       note: "Movie tickets refund"
 *                       date: "2026-03-20T00:00:00.000Z"
 *                       method: upi
 *       404:
 *         description: Friend not found
 */
router.get("/:id", getFriend);

// ────────────────────────────────────────────────────────────────
//  PATCH /api/friends/:id
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/friends/{id}:
 *   patch:
 *     summary: Update friend details
 *     description: |
 *       Powers the avatar color picker and nickname editing in the app.
 *       All fields are optional. Cannot change `friend` (userId) or `balance`.
 *     tags: [Friends]
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
 *               friendName:  { type: string, example: "Priya K." }
 *               nickName:    { type: string, example: "Priya Di" }
 *               friendPhone: { type: string, example: "+919876500001" }
 *               friendEmail: { type: string, example: "priya@gmail.com" }
 *               avatarColor: { type: string, example: "#378add" }
 *           examples:
 *             update_avatar_color:
 *               summary: Change avatar color
 *               value:
 *                 avatarColor: "#378add"
 *             update_nickname:
 *               summary: Set a nickname
 *               value:
 *                 nickName: "Priya Di"
 *     responses:
 *       200:
 *         description: Friend updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     friend: { $ref: '#/components/schemas/Friend' }
 *       404:
 *         description: Friend not found
 *       409:
 *         description: Another friend with this phone already exists
 */
router.patch("/:id", updateFriend);

// ────────────────────────────────────────────────────────────────
//  DELETE /api/friends/:id
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/friends/{id}:
 *   delete:
 *     summary: Remove a friend (blocked if unsettled balance)
 *     description: |
 *       Permanently removes the friend connection.
 *       Blocked if `Math.abs(balance) > 0` — user must settle up first.
 *     tags: [Friends]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Friend removed successfully
 *       400:
 *         description: Cannot remove — unsettled balance exists
 *         content:
 *           application/json:
 *             example:
 *               response:
 *                 response_code: "400"
 *                 response_message: "Cannot remove — unsettled balance of ₹210.00. Settle up first."
 *               data: null
 *       404:
 *         description: Friend not found
 */
router.delete("/:id", deleteFriend);

// ────────────────────────────────────────────────────────────────
//  POST /api/friends/:id/transactions
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/friends/{id}/transactions:
 *   post:
 *     summary: Record a "You Gave" or "You Received" transaction
 *     description: |
 *       Powers the two bottom buttons in the Friend Detail overlay.
 *       "You Gave ↑" → direction: gave  (you paid the friend — balance goes down)
 *       "You Received ↓" → direction: received  (friend paid you — balance goes up)
 *       The balance, expenseCount and lastTransactionDate are auto-recalculated.
 *     tags: [Friends]
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
 *             required: [direction, amount]
 *             properties:
 *               direction:
 *                 type: string
 *                 enum: [gave, received]
 *                 description: |
 *                   `gave` = You Gave button (you paid them).
 *                   `received` = You Received button (they paid you).
 *                 example: gave
 *               amount:
 *                 type: number
 *                 example: 350
 *               note:
 *                 type: string
 *                 example: "Lunch split"
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-22"
 *                 description: Defaults to today if not provided.
 *               method:
 *                 type: string
 *                 enum: [upi, cash, bank, other]
 *                 default: cash
 *                 example: upi
 *           examples:
 *             you_gave:
 *               summary: You gave money (You Gave button)
 *               value:
 *                 direction: gave
 *                 amount: 350
 *                 note: "Lunch split"
 *                 date: "2026-03-22"
 *                 method: cash
 *             you_received:
 *               summary: You received money (You Received button)
 *               value:
 *                 direction: received
 *                 amount: 900
 *                 note: "Movie tickets refund"
 *                 date: "2026-03-20"
 *                 method: upi
 *     responses:
 *       200:
 *         description: Transaction recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     balance:
 *                       type: number
 *                       description: Updated balance after this transaction
 *                       example: -210
 *                     expenseCount:
 *                       type: integer
 *                       example: 3
 *                     transaction:
 *                       $ref: '#/components/schemas/Transaction'
 *       400:
 *         description: Validation error (invalid direction, amount, or method)
 *       404:
 *         description: Friend not found
 */
router.post("/:id/transactions", addTransaction);

// ────────────────────────────────────────────────────────────────
//  DELETE /api/friends/:id/transactions/:txId
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/friends/{id}/transactions/{txId}:
 *   delete:
 *     summary: Delete a single transaction
 *     description: |
 *       Removes a specific transaction entry from the friend's history.
 *       Balance and expenseCount are automatically recalculated.
 *     tags: [Friends]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Friend document ID
 *       - in: path
 *         name: txId
 *         required: true
 *         schema: { type: string }
 *         description: Transaction subdocument ID
 *     responses:
 *       200:
 *         description: Transaction deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     balance:
 *                       type: number
 *                       example: 550
 *                     expenseCount:
 *                       type: integer
 *                       example: 4
 *       404:
 *         description: Friend not found or transaction not found
 */
router.delete("/:id/transactions/:txId", deleteTransaction);

// ────────────────────────────────────────────────────────────────
//  POST /api/friends/:id/settle
// ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/friends/{id}/settle:
 *   post:
 *     summary: Settle up — zero out the full balance in one tap
 *     description: |
 *       Powers the "Settle Up" button on the friend card and the Settle Up overlay.
 *       Automatically calculates the correct direction and amount to zero the balance:
 *       - balance > 0 (friend owes you) → records `received` transaction
 *       - balance < 0 (you owe friend) → records `gave` transaction
 *     tags: [Friends]
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
 *               method:
 *                 type: string
 *                 enum: [upi, cash, bank, other]
 *                 default: upi
 *                 example: upi
 *               note:
 *                 type: string
 *                 example: "Full settlement"
 *           example:
 *             method: upi
 *             note: "Full settlement"
 *     responses:
 *       200:
 *         description: Settled successfully — balance is now ₹0
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     balance:
 *                       type: number
 *                       example: 0
 *                     expenseCount:
 *                       type: integer
 *                       example: 6
 *                     settledAmount:
 *                       type: number
 *                       example: 4300
 *                     direction:
 *                       type: string
 *                       enum: [gave, received]
 *                       example: received
 *       400:
 *         description: Already settled (balance is already ₹0)
 *       404:
 *         description: Friend not found
 */
router.post("/:id/settle", settleUp);

module.exports = router;
