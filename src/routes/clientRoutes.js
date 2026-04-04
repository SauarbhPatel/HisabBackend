const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
    getClients,
    getClient,
    createClient,
    updateClient,
    updateClientStatus,
    deleteClient,
    getClientPaymentHistory,
    recalculateClientStats,
} = require("../controllers/clientController");

router.use(protect); // all client routes require auth

// ══════════════════════════════════════════════════════════════
//  SWAGGER SCHEMAS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * components:
 *   schemas:
 *     Client:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664abc123def456"
 *         owner:
 *           type: string
 *           example: "664user000000"
 *         name:
 *           type: string
 *           example: "Maksoft Technologies"
 *         contactPerson:
 *           type: string
 *           example: "Rajesh M."
 *         phone:
 *           type: string
 *           example: "+919800000001"
 *         email:
 *           type: string
 *           example: "rajesh@maksoft.com"
 *         industry:
 *           type: string
 *           enum: [Technology, Education, Real Estate, Retail, Finance, Healthcare, Other]
 *           example: "Technology"
 *         notes:
 *           type: string
 *           example: "Referred by Rahul"
 *         icon:
 *           type: string
 *           example: "🟣"
 *         avatarColor:
 *           type: string
 *           example: "#EDE9FE"
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *           example: "active"
 *         totalBilled:
 *           type: number
 *           example: 5500
 *         totalReceived:
 *           type: number
 *           example: 5500
 *         totalPending:
 *           type: number
 *           description: Virtual — totalBilled minus totalReceived
 *           example: 0
 *         paymentPercent:
 *           type: integer
 *           description: Virtual — percentage of totalBilled received
 *           example: 100
 *         projectCount:
 *           type: integer
 *           example: 2
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     ClientPaymentHistoryEntry:
 *       type: object
 *       properties:
 *         projectId:     { type: string }
 *         project:       { type: string, example: "Flatshare Karo (Dev)" }
 *         projectStatus: { type: string, example: "inprogress" }
 *         label:         { type: string, example: "Advance Payment" }
 *         amount:        { type: number, example: 5000 }
 *         date:          { type: string, format: date-time }
 *         method:        { type: string, enum: [upi, bank, cash, cheque, other], example: "upi" }
 *         reference:     { type: string, example: "UPI Ref: 123456789" }
 *         note:          { type: string, example: "Received after follow-up call" }
 *         status:        { type: string, enum: [paid, pending, due], example: "paid" }
 *         paymentId:     { type: string }
 */

// ══════════════════════════════════════════════════════════════
//  LIST CLIENTS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/clients:
 *   get:
 *     summary: List all clients with aggregate stats
 *     description: |
 *       Returns all clients owned by the authenticated user.
 *       Supports filtering by status, industry, and free-text search.
 *       Top-level `stats` shows totals across all returned clients.
 *       Powers the "My Clients" overlay in the app.
 *     tags: [Clients]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive] }
 *         description: Filter by client status
 *       - in: query
 *         name: industry
 *         schema:
 *           type: string
 *           enum: [Technology, Education, Real Estate, Retail, Finance, Healthcare, Other]
 *         description: Filter by industry
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search across name, contactPerson, phone, email
 *     responses:
 *       200:
 *         description: Clients fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Clients fetched successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     count: { type: integer, example: 3 }
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalBilled:   { type: number, example: 44000 }
 *                         totalReceived: { type: number, example: 29000 }
 *                         totalPending:  { type: number, example: 15000 }
 *                     clients:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Client' }
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Clients fetched successfully."
 *               data:
 *                 count: 3
 *                 stats:
 *                   totalBilled:   44000
 *                   totalReceived: 29000
 *                   totalPending:  15000
 *                 clients:
 *                   - _id: "664abc1"
 *                     name: "Maksoft Technologies"
 *                     contactPerson: "Rajesh M."
 *                     phone: "+919800000001"
 *                     industry: "Technology"
 *                     status: "active"
 *                     icon: "🟣"
 *                     avatarColor: "#EDE9FE"
 *                     totalBilled: 5500
 *                     totalReceived: 5500
 *                     totalPending: 0
 *                     projectCount: 2
 *                   - _id: "664abc2"
 *                     name: "Flatshare Karo"
 *                     contactPerson: "Prashant K."
 *                     phone: "+919700000002"
 *                     industry: "Technology"
 *                     status: "active"
 *                     icon: "🟡"
 *                     avatarColor: "#FEF3C7"
 *                     totalBilled: 16000
 *                     totalReceived: 11000
 *                     totalPending: 5000
 *                     projectCount: 3
 */
router.get("/", getClients);

// ══════════════════════════════════════════════════════════════
//  CREATE CLIENT
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/clients:
 *   post:
 *     summary: Add a new client
 *     description: |
 *       Creates a new client record. Client names are unique per owner.
 *       `icon` is the emoji shown in the avatar circle (e.g. 🟣 🟡 🟢 🏢).
 *       `avatarColor` is the background hex for the avatar (e.g. #EDE9FE).
 *       Industry is used for filtering in the "My Clients" overlay.
 *     tags: [Clients]
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
 *               name:          { type: string, example: "Maksoft Technologies", description: "Min 2 chars. Must be unique." }
 *               contactPerson: { type: string, example: "Rajesh M." }
 *               phone:         { type: string, example: "+919800000001" }
 *               email:         { type: string, example: "rajesh@maksoft.com" }
 *               industry:
 *                 type: string
 *                 enum: [Technology, Education, Real Estate, Retail, Finance, Healthcare, Other]
 *                 example: Technology
 *               notes:       { type: string, example: "Referred by Rahul" }
 *               icon:        { type: string, example: "🟣", description: "Emoji for avatar" }
 *               avatarColor: { type: string, example: "#EDE9FE", description: "Hex background for avatar" }
 *           examples:
 *             tech_client:
 *               summary: Technology client
 *               value:
 *                 name: "Maksoft Technologies"
 *                 contactPerson: "Rajesh M."
 *                 phone: "+919800000001"
 *                 email: "rajesh@maksoft.com"
 *                 industry: "Technology"
 *                 icon: "🟣"
 *                 avatarColor: "#EDE9FE"
 *             edu_client:
 *               summary: Education client
 *               value:
 *                 name: "School ERP Client"
 *                 contactPerson: "Principal"
 *                 phone: "+919600000003"
 *                 industry: "Education"
 *                 notes: "Government school, slow payment cycle"
 *                 icon: "🟢"
 *                 avatarColor: "#D1FAE5"
 *     responses:
 *       200:
 *         description: Client added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Client added successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     client: { $ref: '#/components/schemas/Client' }
 *       409:
 *         description: A client with this name already exists
 *       400:
 *         description: Validation error (invalid industry, name too short)
 */
router.post("/", createClient);

// ══════════════════════════════════════════════════════════════
//  GET SINGLE CLIENT
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/clients/{id}:
 *   get:
 *     summary: Get a client with their linked projects
 *     description: |
 *       Returns the full client record plus a summary of all projects
 *       linked to this client (matched by client name).
 *       Powers the "Client Detail" overlay in the app.
 *     tags: [Clients]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Client document ID
 *         example: "664abc123def456"
 *     responses:
 *       200:
 *         description: Client fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Client fetched successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     client:
 *                       $ref: '#/components/schemas/Client'
 *                     projects:
 *                       type: array
 *                       description: Projects linked to this client (by name match)
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:            { type: string }
 *                           name:           { type: string, example: "Flatshare Karo (Dev)" }
 *                           type:           { type: string, example: "Development" }
 *                           status:         { type: string, example: "inprogress" }
 *                           startDate:      { type: string, format: date-time }
 *                           endDate:        { type: string, format: date-time, nullable: true }
 *                           totalPrice:     { type: number, example: 10000 }
 *                           receivedAmount: { type: number, example: 7000 }
 *                           pendingAmount:  { type: number, example: 3000 }
 *                           paymentPercent: { type: integer, example: 70 }
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Client fetched successfully."
 *               data:
 *                 client:
 *                   _id: "664abc2"
 *                   name: "Flatshare Karo"
 *                   contactPerson: "Prashant K."
 *                   phone: "+919700000002"
 *                   industry: "Technology"
 *                   status: "active"
 *                   totalBilled: 16000
 *                   totalReceived: 11000
 *                   totalPending: 5000
 *                 projects:
 *                   - _id: "664proj1"
 *                     name: "Flatshare Karo (Dev)"
 *                     status: "inprogress"
 *                     totalPrice: 10000
 *                     receivedAmount: 7000
 *                     pendingAmount: 3000
 *                     paymentPercent: 70
 *                   - _id: "664proj2"
 *                     name: "Flatshare Deployment"
 *                     status: "completed"
 *                     totalPrice: 3000
 *                     receivedAmount: 2000
 *                     pendingAmount: 1000
 *                     paymentPercent: 67
 *       404:
 *         description: Client not found
 */
router.get("/:id", getClient);

// ══════════════════════════════════════════════════════════════
//  UPDATE CLIENT
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/clients/{id}:
 *   patch:
 *     summary: Update client details
 *     description: |
 *       Updates any editable fields on the client. All fields are optional.
 *       If `name` is changed, it does NOT auto-update linked projects
 *       (projects store client name as a plain string). Use with care.
 *       Duplicate name check (per owner) is enforced.
 *       Powers the "Edit Client" overlay in the app.
 *     tags: [Clients]
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
 *               name:          { type: string, example: "Maksoft Pvt. Ltd." }
 *               contactPerson: { type: string, example: "Rajesh Kumar" }
 *               phone:         { type: string, example: "+919800000001" }
 *               email:         { type: string, example: "rajesh@maksoft.com" }
 *               industry:
 *                 type: string
 *                 enum: [Technology, Education, Real Estate, Retail, Finance, Healthcare, Other]
 *               notes:       { type: string }
 *               icon:        { type: string, example: "🟣" }
 *               avatarColor: { type: string, example: "#EDE9FE" }
 *           examples:
 *             update_contact:
 *               summary: Update contact person and phone only
 *               value:
 *                 contactPerson: "Rajesh Kumar"
 *                 phone: "+919811111111"
 *             update_industry:
 *               summary: Correct the industry
 *               value:
 *                 industry: "Education"
 *                 notes: "Now focused on EdTech vertical"
 *     responses:
 *       200:
 *         description: Client updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     client: { $ref: '#/components/schemas/Client' }
 *       404:
 *         description: Client not found
 *       409:
 *         description: Another client with this name already exists
 */
router.patch("/:id", updateClient);

// ══════════════════════════════════════════════════════════════
//  UPDATE CLIENT STATUS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/clients/{id}/status:
 *   patch:
 *     summary: Update client status (active / inactive)
 *     description: |
 *       Quickly toggle a client between active and inactive.
 *       Powers the "Client Status" overlay in the app.
 *       Inactive clients are still shown in history but filtered out by default in listing.
 *     tags: [Clients]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 example: inactive
 *     responses:
 *       200:
 *         description: Client status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     client: { $ref: '#/components/schemas/Client' }
 *       400:
 *         description: Invalid status value
 *       404:
 *         description: Client not found
 */
router.patch("/:id/status", updateClientStatus);

// ══════════════════════════════════════════════════════════════
//  DELETE CLIENT  (soft delete)
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/clients/{id}:
 *   delete:
 *     summary: Remove a client (soft delete — blocked if active projects exist)
 *     description: |
 *       Soft-deletes the client by setting `isActive: false`.
 *       **Blocked** if the client has any projects with status `inprogress` or `onstay`.
 *       Complete or archive those projects first, then retry.
 *       Powers the 🗑 Remove button in the Client Detail overlay.
 *     tags: [Clients]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Client removed successfully
 *         content:
 *           application/json:
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Client removed successfully."
 *               data: null
 *       400:
 *         description: Cannot delete — active project exists for this client
 *         content:
 *           application/json:
 *             example:
 *               response:
 *                 response_code: "400"
 *                 response_message: "Cannot remove — \"Flatshare Karo (Dev)\" is still active for this client. Complete or archive the project first."
 *               data: null
 *       404:
 *         description: Client not found
 */
router.delete("/:id", deleteClient);

// ══════════════════════════════════════════════════════════════
//  PAYMENT HISTORY
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/clients/{id}/payment-history:
 *   get:
 *     summary: Full payment history for a client across all their projects
 *     description: |
 *       Aggregates all `clientPayments` entries from every linked project,
 *       sorted newest first.
 *       Also returns overall stats: totalBilled, totalReceived, totalPending, projectCount.
 *       Powers the "Payment History" card inside the Client Detail overlay.
 *     tags: [Clients]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Client payment history fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Client payment history fetched successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     client:
 *                       type: object
 *                       properties:
 *                         id:            { type: string }
 *                         name:          { type: string }
 *                         contactPerson: { type: string }
 *                         phone:         { type: string }
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalBilled:   { type: number, example: 16000 }
 *                         totalReceived: { type: number, example: 11000 }
 *                         totalPending:  { type: number, example: 5000 }
 *                         projectCount:  { type: integer, example: 3 }
 *                     history:
 *                       type: array
 *                       description: All payment records across projects, newest first
 *                       items: { $ref: '#/components/schemas/ClientPaymentHistoryEntry' }
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Client payment history fetched successfully."
 *               data:
 *                 client:
 *                   id: "664abc2"
 *                   name: "Flatshare Karo"
 *                   contactPerson: "Prashant K."
 *                   phone: "+919700000002"
 *                 stats:
 *                   totalBilled: 16000
 *                   totalReceived: 11000
 *                   totalPending: 5000
 *                   projectCount: 3
 *                 history:
 *                   - projectId: "664proj1"
 *                     project: "Flatshare Karo (Dev)"
 *                     projectStatus: "inprogress"
 *                     label: "Second Installment"
 *                     amount: 2000
 *                     date: "2026-02-25T00:00:00.000Z"
 *                     method: "upi"
 *                     status: "paid"
 *                   - projectId: "664proj1"
 *                     project: "Flatshare Karo (Dev)"
 *                     projectStatus: "inprogress"
 *                     label: "Advance Payment"
 *                     amount: 5000
 *                     date: "2026-01-15T00:00:00.000Z"
 *                     method: "upi"
 *                     status: "paid"
 *       404:
 *         description: Client not found
 */
router.get("/:id/payment-history", getClientPaymentHistory);

// ══════════════════════════════════════════════════════════════
//  RECALCULATE STATS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/clients/{id}/recalculate:
 *   post:
 *     summary: Force-recalculate totalBilled, totalReceived, projectCount from live project data
 *     description: |
 *       Recomputes cached aggregate stats by scanning all linked projects.
 *       Useful after bulk project edits or data corrections.
 *       projectController automatically calls this after project create/update/pay,
 *       so manual calls should rarely be needed.
 *     tags: [Clients]
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
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     client:
 *                       type: object
 *                       properties:
 *                         id:            { type: string }
 *                         name:          { type: string }
 *                         totalBilled:   { type: number }
 *                         totalReceived: { type: number }
 *                         projectCount:  { type: integer }
 *       404:
 *         description: Client not found
 */
router.post("/:id/recalculate", recalculateClientStats);

module.exports = router;
