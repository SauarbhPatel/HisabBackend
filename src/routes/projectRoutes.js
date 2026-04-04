const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
    getProjects,
    getProjectSummary,
    getProject,
    createProject,
    updateProject,
    updateProjectStatus,
    deleteProject,
    addClientPayment,
    updateClientPayment,
    deleteClientPayment,
    addDevToProject,
    updateDevStatus,
    payDeveloper,
    getDevPaymentHistory,
} = require("../controllers/projectController");

router.use(protect); // all project routes require auth

// ══════════════════════════════════════════════════════════════
//  SWAGGER SCHEMAS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * components:
 *   schemas:
 *
 *     DevPayment:
 *       type: object
 *       properties:
 *         _id:    { type: string }
 *         amount: { type: number, example: 2000 }
 *         date:   { type: string, format: date-time }
 *         method: { type: string, enum: [upi, cash, bank, other], example: "upi" }
 *         note:   { type: string, example: "Milestone 1 payment" }
 *
 *     ProjectDev:
 *       type: object
 *       properties:
 *         _id:          { type: string }
 *         developer:    { type: object, description: "Populated Developer document" }
 *         role:         { type: string, example: "Frontend Developer" }
 *         agreedAmount: { type: number, example: 7000 }
 *         paidAmount:   { type: number, example: 4000 }
 *         status:       { type: string, enum: [active, paused, removed], example: "active" }
 *         payments:     { type: array, items: { $ref: '#/components/schemas/DevPayment' } }
 *
 *     ClientPayment:
 *       type: object
 *       properties:
 *         _id:       { type: string }
 *         label:     { type: string, example: "Advance Payment" }
 *         amount:    { type: number, example: 5000 }
 *         date:      { type: string, format: date-time }
 *         method:    { type: string, enum: [upi, cash, bank, cheque, other], example: "upi" }
 *         reference: { type: string, example: "UPI Ref: 123456" }
 *         note:      { type: string, example: "Received after follow-up call" }
 *         status:    { type: string, enum: [paid, pending, due], example: "paid" }
 *
 *     Project:
 *       type: object
 *       properties:
 *         _id:            { type: string, example: "664proj001" }
 *         owner:          { type: string, example: "664user001" }
 *         name:           { type: string, example: "Flatshare Karo (Development)" }
 *         type:
 *           type: string
 *           enum: [Development, "UI/UX Design", Deployment, Maintenance, "Mobile App", "Web App", "API Integration", Other]
 *           example: Development
 *         client:         { type: string, example: "Flatshare Karo" }
 *         startDate:      { type: string, format: date-time }
 *         endDate:        { type: string, format: date-time, nullable: true }
 *         notes:          { type: string, example: "High priority — client deadline is firm" }
 *         tags:           { type: array, items: { type: string }, example: ["urgent","retainer"] }
 *         totalPrice:     { type: number, example: 10000 }
 *         receivedAmount: { type: number, example: 7000 }
 *         status:
 *           type: string
 *           enum: [inactive, inprogress, onstay, completed, cancelled]
 *           example: inprogress
 *         invoiceUrl:     { type: string, nullable: true }
 *         invoiceNumber:  { type: string, nullable: true }
 *         clientPayments: { type: array, items: { $ref: '#/components/schemas/ClientPayment' } }
 *         developers:     { type: array, items: { $ref: '#/components/schemas/ProjectDev' } }
 *         pendingAmount:  { type: number, description: "Virtual — totalPrice minus receivedAmount", example: 3000 }
 *         paymentPercent: { type: integer, description: "Virtual — % of totalPrice received", example: 70 }
 *         totalDevAgreed: { type: number, description: "Virtual — sum of all dev agreedAmounts", example: 10000 }
 *         totalDevPaid:   { type: number, description: "Virtual — sum of all dev paidAmounts", example: 4000 }
 *         profit:         { type: number, description: "Virtual — receivedAmount minus totalDevPaid", example: 3000 }
 *         isArchived:     { type: boolean, example: false }
 *         createdAt:      { type: string, format: date-time }
 *         updatedAt:      { type: string, format: date-time }
 */

// ══════════════════════════════════════════════════════════════
//  LIST PROJECTS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: List all projects (grouped by month)
 *     description: |
 *       Returns all non-archived projects for the owner.
 *       Results are grouped by `startDate` month for the month-group UI sections.
 *       Supports filtering by year, status, client name, and free-text search.
 *       Top-level `stats` aggregates totals across all returned projects.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer, example: 2026 }
 *         description: Filter by start year (e.g. 2026 shows Jan–Dec 2026)
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [inactive, inprogress, onstay, completed, cancelled] }
 *       - in: query
 *         name: client
 *         schema: { type: string }
 *         description: Partial match on client name (case-insensitive)
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search across name, client, type, tags
 *     responses:
 *       200:
 *         description: Projects fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: object
 *                   properties:
 *                     response_code:    { type: string, example: "200" }
 *                     response_message: { type: string, example: "Projects fetched successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     count: { type: integer, example: 7 }
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalReceived: { type: number, example: 34000 }
 *                         totalPending:  { type: number, example: 10000 }
 *                         totalDevPaid:  { type: number, example: 8500 }
 *                         netProfit:     { type: number, example: 25500 }
 *                         activeCount:   { type: integer, example: 3 }
 *                     grouped:
 *                       type: object
 *                       description: Projects keyed by YYYY-MM month of startDate
 *                       additionalProperties:
 *                         type: array
 *                         items: { $ref: '#/components/schemas/Project' }
 *                     projects:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Project' }
 */
router.get("/", getProjects);

// ══════════════════════════════════════════════════════════════
//  CREATE PROJECT
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project (2-step form in UI)
 *     description: |
 *       Creates a project with optional developer slots.
 *       If `developers` array is omitted, they can be added later via
 *       `POST /api/projects/:id/developers`.
 *       Type must match one of the suggestion chips shown in the UI.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, client, startDate, totalPrice]
 *             properties:
 *               name:       { type: string, example: "School ERP v2" }
 *               type:
 *                 type: string
 *                 enum: [Development, "UI/UX Design", Deployment, Maintenance, "Mobile App", "Web App", "API Integration", Other]
 *                 default: Development
 *               client:     { type: string, example: "School ERP Client" }
 *               startDate:  { type: string, format: date, example: "2026-04-01" }
 *               endDate:    { type: string, format: date, example: "2026-06-30", nullable: true }
 *               totalPrice: { type: number, example: 15000 }
 *               notes:      { type: string, example: "High priority project" }
 *               tags:       { type: array, items: { type: string }, example: ["urgent"] }
 *               developers:
 *                 type: array
 *                 description: Optional — add developer slots at creation time
 *                 items:
 *                   type: object
 *                   required: [developer, agreedAmount]
 *                   properties:
 *                     developer:    { type: string, description: "Developer document _id" }
 *                     agreedAmount: { type: number, example: 6000 }
 *                     role:         { type: string, example: "Backend Developer" }
 *           examples:
 *             with_devs:
 *               summary: Project with developer slots
 *               value:
 *                 name: "School ERP v2"
 *                 type: "Development"
 *                 client: "School ERP Client"
 *                 startDate: "2026-04-01"
 *                 totalPrice: 15000
 *                 developers:
 *                   - developer: "664dev001"
 *                     agreedAmount: 6000
 *                     role: "Backend Developer"
 *             without_devs:
 *               summary: Project — add devs later
 *               value:
 *                 name: "QR Park Plus (Update)"
 *                 type: "Maintenance"
 *                 client: "Maksoft Technologies"
 *                 startDate: "2026-04-10"
 *                 totalPrice: 500
 *     responses:
 *       200:
 *         description: Project created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     project: { $ref: '#/components/schemas/Project' }
 */
router.post("/", createProject);

// ══════════════════════════════════════════════════════════════
//  YEAR SUMMARY  (must be before /:id)
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/projects/summary:
 *   get:
 *     summary: Annual income/profit summary for Reports screen
 *     description: |
 *       Aggregates all projects in a given year.
 *       Powers the Reports screen income card and byClient bar chart.
 *       **Important:** This route is registered before `/:id` to prevent conflicts.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer, example: 2026 }
 *         description: Year to summarise. Defaults to current year.
 *     responses:
 *       200:
 *         description: Project summary fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     year: { type: integer, example: 2026 }
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalBilled:   { type: number, example: 44000 }
 *                         totalReceived: { type: number, example: 34000 }
 *                         totalPending:  { type: number, example: 10000 }
 *                         totalDevPaid:  { type: number, example: 8500 }
 *                         netProfit:     { type: number, example: 25500 }
 *                         projectCount:  { type: integer, example: 7 }
 *                         byStatus:
 *                           type: object
 *                           example: { inprogress: 3, completed: 3, onstay: 1 }
 *                         byClient:
 *                           type: object
 *                           example: { "School ERP Client": 12500, "Flatshare Karo": 11000, "Maksoft Technologies": 5500 }
 */
router.get("/summary", getProjectSummary);

// ══════════════════════════════════════════════════════════════
//  SINGLE PROJECT
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     summary: Get a project with full detail (client payments + dev slots)
 *     description: |
 *       Returns the complete project document including all clientPayments
 *       and developer slots (with populated developer info).
 *       Powers the Project Detail overlay.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Project fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     project: { $ref: '#/components/schemas/Project' }
 *       404:
 *         description: Project not found
 */
router.get("/:id", getProject);

// ══════════════════════════════════════════════════════════════
//  UPDATE PROJECT
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/projects/{id}:
 *   patch:
 *     summary: Update project details (Edit Project overlay)
 *     description: |
 *       Updates editable fields on a project. All fields are optional.
 *       Does NOT change `status` — use `PATCH /:id/status` for that.
 *       Does NOT manage developers — use the `/developers` sub-routes.
 *     tags: [Projects]
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
 *               name:          { type: string }
 *               type:          { type: string, enum: [Development, "UI/UX Design", Deployment, Maintenance, "Mobile App", "Web App", "API Integration", Other] }
 *               client:        { type: string }
 *               startDate:     { type: string, format: date }
 *               endDate:       { type: string, format: date }
 *               totalPrice:    { type: number }
 *               notes:         { type: string }
 *               tags:          { type: array, items: { type: string } }
 *               invoiceUrl:    { type: string }
 *               invoiceNumber: { type: string }
 *     responses:
 *       200:
 *         description: Project updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     project: { $ref: '#/components/schemas/Project' }
 *       400:
 *         description: No valid fields / invalid type or price
 *       404:
 *         description: Project not found
 */
router.patch("/:id", updateProject);

// ══════════════════════════════════════════════════════════════
//  UPDATE PROJECT STATUS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/projects/{id}/status:
 *   patch:
 *     summary: Change project status (Status Overlay)
 *     description: |
 *       Dedicated endpoint for the 🔄 Status overlay which shows all 5 options:
 *       In-Active | In-Progress | On-Stay | Completed | Cancelled.
 *       Separated from the general PATCH to keep status changes explicit.
 *     tags: [Projects]
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
 *                 enum: [inactive, inprogress, onstay, completed, cancelled]
 *                 example: completed
 *     responses:
 *       200:
 *         description: Project status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     project: { $ref: '#/components/schemas/Project' }
 *       400:
 *         description: Invalid status value
 *       404:
 *         description: Project not found
 */
router.patch("/:id/status", updateProjectStatus);

// ══════════════════════════════════════════════════════════════
//  DELETE PROJECT (archive)
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: Archive a project (soft delete)
 *     description: |
 *       Sets `isArchived: true`. The project is hidden from listings
 *       but retained for audit / history. Powers the 🗑 Delete button
 *       in the Project Detail overlay.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Project archived successfully
 *         content:
 *           application/json:
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Project archived successfully."
 *               data: null
 *       404:
 *         description: Project not found
 */
router.delete("/:id", deleteProject);

// ══════════════════════════════════════════════════════════════
//  CLIENT PAYMENTS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/projects/{id}/client-payments:
 *   post:
 *     summary: Record a client payment on this project
 *     description: |
 *       Adds a payment entry to `clientPayments[]`.
 *       If `status` is `paid`, the project's `receivedAmount` is
 *       automatically recalculated by the pre-save hook.
 *       Powers the `+ Record` button in the Client Payments timeline.
 *     tags: [Projects]
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
 *             required: [label, amount, date]
 *             properties:
 *               label:     { type: string, example: "Advance Payment" }
 *               amount:    { type: number, example: 5000 }
 *               date:      { type: string, format: date, example: "2026-01-15" }
 *               method:    { type: string, enum: [upi, cash, bank, cheque, other], default: upi }
 *               reference: { type: string, example: "UPI Ref: 123456789" }
 *               note:      { type: string, example: "Received after follow-up call" }
 *               status:    { type: string, enum: [paid, pending, due], default: paid }
 *           examples:
 *             advance_paid:
 *               summary: Advance payment received
 *               value:
 *                 label: "Advance Payment"
 *                 amount: 5000
 *                 date: "2026-01-15"
 *                 method: "upi"
 *                 reference: "UPI Ref: 987654321"
 *                 status: "paid"
 *             final_pending:
 *               summary: Final payment still pending
 *               value:
 *                 label: "Final Payment"
 *                 amount: 3000
 *                 date: "2026-04-30"
 *                 status: "pending"
 *                 note: "Due after project delivery"
 *     responses:
 *       200:
 *         description: Client payment recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     receivedAmount: { type: number, example: 5000 }
 *                     pendingAmount:  { type: number, example: 5000 }
 *                     paymentPercent: { type: integer, example: 50 }
 *                     clientPayments: { type: array, items: { $ref: '#/components/schemas/ClientPayment' } }
 */
router.post("/:id/client-payments", addClientPayment);

/**
 * @swagger
 * /api/projects/{id}/client-payments/{paymentId}:
 *   patch:
 *     summary: Update a client payment entry
 *     description: |
 *       Updates any field on an existing client payment.
 *       Changing `status` between `paid` and `pending`/`due` will
 *       automatically re-sync `receivedAmount` via the pre-save hook.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label:     { type: string }
 *               amount:    { type: number }
 *               date:      { type: string, format: date }
 *               method:    { type: string, enum: [upi, cash, bank, cheque, other] }
 *               reference: { type: string }
 *               note:      { type: string }
 *               status:    { type: string, enum: [paid, pending, due] }
 *     responses:
 *       200:
 *         description: Client payment updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     payment:        { $ref: '#/components/schemas/ClientPayment' }
 *                     receivedAmount: { type: number }
 *                     pendingAmount:  { type: number }
 *                     paymentPercent: { type: integer }
 *       404:
 *         description: Project or payment not found
 */
router.patch("/:id/client-payments/:paymentId", updateClientPayment);

/**
 * @swagger
 * /api/projects/{id}/client-payments/{paymentId}:
 *   delete:
 *     summary: Delete a client payment entry
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Payment deleted and receivedAmount re-synced
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     receivedAmount: { type: number }
 *                     pendingAmount:  { type: number }
 *       404:
 *         description: Project not found
 */
router.delete("/:id/client-payments/:paymentId", deleteClientPayment);

// ══════════════════════════════════════════════════════════════
//  DEVELOPER ASSIGNMENTS
// ══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/projects/{id}/developers:
 *   post:
 *     summary: Add a developer to this project (+ Add Dev button)
 *     description: |
 *       Adds a developer slot to the project. Developer must already
 *       exist in the Developers collection (owned by the same user).
 *       Blocked if the developer is already assigned to this project.
 *     tags: [Projects]
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
 *             required: [developer, agreedAmount]
 *             properties:
 *               developer:    { type: string, description: "Developer _id", example: "664dev001" }
 *               agreedAmount: { type: number, example: 7000 }
 *               role:         { type: string, example: "Frontend Developer", description: "Overrides developer default role for this project" }
 *     responses:
 *       200:
 *         description: Developer added to project
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     developers:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ProjectDev' }
 *       409:
 *         description: Developer already on this project
 *       404:
 *         description: Developer or project not found
 */
router.post("/:id/developers", addDevToProject);

/**
 * @swagger
 * /api/projects/{id}/developers/{devId}/status:
 *   patch:
 *     summary: Change dev slot status (⏸ Pause / ▶ Resume / 🗑 Remove)
 *     description: |
 *       Sets the developer's status on this project only.
 *       - `active`  → ● Active (can receive payments)
 *       - `paused`  → ⏸ Paused (on hold, dimmed in UI)
 *       - `removed` → logically deleted from project (payments blocked)
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: devId
 *         required: true
 *         schema: { type: string }
 *         description: The developer slot _id (not the Developer document _id)
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
 *                 enum: [active, paused, removed]
 *                 example: paused
 *     responses:
 *       200:
 *         description: Developer status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     slot: { $ref: '#/components/schemas/ProjectDev' }
 *       404:
 *         description: Project or developer slot not found
 */
router.patch("/:id/developers/:devId/status", updateDevStatus);

/**
 * @swagger
 * /api/projects/{id}/developers/{devId}/pay:
 *   post:
 *     summary: Record a payment to a developer on this project (💸 Pay button)
 *     description: |
 *       Adds a payment instalment to the developer's slot.
 *       The slot's `paidAmount` is automatically recalculated by the pre-save hook.
 *       The Developer document's `totalPaid`/`totalPending` aggregate stats
 *       are also synced via `updateDevStats`.
 *       Blocked if the developer slot is `removed`.
 *       Blocked if the new total would exceed `agreedAmount`.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: devId
 *         required: true
 *         schema: { type: string }
 *         description: Developer slot _id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: number, example: 2000 }
 *               date:   { type: string, format: date, example: "2026-03-21" }
 *               method: { type: string, enum: [upi, cash, bank, other], default: upi }
 *               note:   { type: string, example: "Milestone 2 payment" }
 *           examples:
 *             upi_payment:
 *               summary: Pay via UPI
 *               value:
 *                 amount: 2000
 *                 date: "2026-03-21"
 *                 method: "upi"
 *                 note: "2nd installment"
 *             cash_payment:
 *               summary: Pay cash
 *               value:
 *                 amount: 2000
 *                 method: "cash"
 *     responses:
 *       200:
 *         description: Developer payment recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     paidAmount:   { type: number, example: 4000 }
 *                     remaining:    { type: number, example: 3000 }
 *                     agreedAmount: { type: number, example: 7000 }
 *                     payments:     { type: array, items: { $ref: '#/components/schemas/DevPayment' } }
 *       400:
 *         description: Amount exceeds agreed amount / developer removed
 *       404:
 *         description: Project or developer slot not found
 */
router.post("/:id/developers/:devId/pay", payDeveloper);

/**
 * @swagger
 * /api/projects/{id}/developers/{devId}/payment-history:
 *   get:
 *     summary: Get a dev's payment history within this project (🔗 Details page)
 *     description: |
 *       Returns the developer's full payment timeline for this specific project.
 *       Powers the Developer Payment Page overlay that slides in when the
 *       user taps `🔗 Details` on a developer card inside a project.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: devId
 *         required: true
 *         schema: { type: string }
 *         description: Developer slot _id
 *     responses:
 *       200:
 *         description: Developer payment history fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     project:
 *                       type: object
 *                       properties:
 *                         id:     { type: string }
 *                         name:   { type: string }
 *                         client: { type: string }
 *                     developer:
 *                       type: object
 *                       description: Populated Developer document
 *                     slot:
 *                       type: object
 *                       properties:
 *                         role:         { type: string }
 *                         agreedAmount: { type: number, example: 7000 }
 *                         paidAmount:   { type: number, example: 4000 }
 *                         remaining:    { type: number, example: 3000 }
 *                         payPercent:   { type: integer, example: 57 }
 *                         status:       { type: string, enum: [active, paused, removed] }
 *                     payments:
 *                       type: array
 *                       description: Sorted newest first
 *                       items: { $ref: '#/components/schemas/DevPayment' }
 *             example:
 *               response:
 *                 response_code: "200"
 *                 response_message: "Developer payment history fetched successfully."
 *               data:
 *                 project:
 *                   id: "664proj001"
 *                   name: "Flatshare Karo (Development)"
 *                   client: "Flatshare Karo"
 *                 developer:
 *                   name: "Zafran"
 *                   role: "Frontend Developer"
 *                   upiId: "zafran@upi"
 *                 slot:
 *                   agreedAmount: 7000
 *                   paidAmount: 4000
 *                   remaining: 3000
 *                   payPercent: 57
 *                   status: "active"
 *                 payments:
 *                   - amount: 2000
 *                     date: "2026-02-25T00:00:00.000Z"
 *                     method: "cash"
 *                     note: "2nd installment"
 *                   - amount: 2000
 *                     date: "2026-01-15T00:00:00.000Z"
 *                     method: "upi"
 *                     note: "Advance"
 *       404:
 *         description: Project or developer slot not found
 */
router.get("/:id/developers/:devId/payment-history", getDevPaymentHistory);

module.exports = router;
