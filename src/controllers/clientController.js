const Client = require("../models/Client");
const Project = require("../models/Project");
const { sendSuccess, sendError } = require("../utils/response");

// ─── Helper: recompute & persist totalBilled / totalReceived / projectCount ─
// Call this whenever a project's financials change (create / update / pay).
const updateClientStats = async (clientName, ownerId) => {
    // Projects are linked by client name (string), matching the Project.client field.
    const projects = await Project.find({
        owner: ownerId,
        client: clientName,
        isArchived: false,
    }).select("totalPrice receivedAmount");

    const totalBilled = projects.reduce((s, p) => s + (p.totalPrice || 0), 0);
    const totalReceived = projects.reduce(
        (s, p) => s + (p.receivedAmount || 0),
        0,
    );
    const projectCount = projects.length;

    await Client.findOneAndUpdate(
        { owner: ownerId, name: clientName },
        { totalBilled, totalReceived, projectCount },
    );
    return { totalBilled, totalReceived, projectCount };
};

// ══════════════════════════════════════════════════════════════
//  GET /api/clients
//  Query: ?status=active&industry=Technology&search=Maksoft
// ══════════════════════════════════════════════════════════════
exports.getClients = async (req, res, next) => {
    try {
        const { status, industry, search } = req.query;
        const filter = { owner: req.user.id, isActive: true };

        if (status) filter.status = status;
        if (industry) filter.industry = industry;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { contactPerson: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }

        const clients = await Client.find(filter).sort({ updatedAt: -1 });

        const totalBilled = clients.reduce(
            (s, c) => s + (c.totalBilled || 0),
            0,
        );
        const totalReceived = clients.reduce(
            (s, c) => s + (c.totalReceived || 0),
            0,
        );
        const totalPending = clients.reduce((s, c) => s + c.totalPending, 0);

        return sendSuccess(
            res,
            {
                count: clients.length,
                stats: {
                    totalBilled: +totalBilled.toFixed(2),
                    totalReceived: +totalReceived.toFixed(2),
                    totalPending: +totalPending.toFixed(2),
                },
                clients,
            },
            "Clients fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  GET /api/clients/:id
//  Returns client + linked projects + payment history
// ══════════════════════════════════════════════════════════════
exports.getClient = async (req, res, next) => {
    try {
        const client = await Client.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!client) return sendError(res, "Client not found.", "404");

        // Fetch all projects linked to this client (matched by name)
        const projects = await Project.find({
            owner: req.user.id,
            client: client.name,
            isArchived: false,
        }).select(
            "name type status startDate endDate totalPrice receivedAmount pendingAmount status clientPayments",
        );

        const projectSummary = projects.map((p) => ({
            _id: p._id,
            name: p.name,
            type: p.type,
            status: p.status,
            startDate: p.startDate,
            endDate: p.endDate,
            totalPrice: p.totalPrice,
            receivedAmount: p.receivedAmount,
            pendingAmount: p.pendingAmount,
            paymentPercent: p.paymentPercent,
        }));

        return sendSuccess(
            res,
            {
                client,
                projects: projectSummary,
            },
            "Client fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  POST /api/clients
//  Body: { name, contactPerson?, phone?, email?, industry?, notes?, icon?, avatarColor? }
// ══════════════════════════════════════════════════════════════
exports.createClient = async (req, res, next) => {
    try {
        const {
            name,
            contactPerson,
            phone,
            email,
            industry,
            notes,
            icon,
            avatarColor,
        } = req.body;

        if (!name || name.trim().length < 2)
            return sendError(
                res,
                "Client name (min 2 chars) is required.",
                "400",
            );

        // Prevent duplicate client names per owner
        const existing = await Client.findOne({
            owner: req.user.id,
            name: name.trim(),
        });
        if (existing)
            return sendError(
                res,
                "A client with this name already exists.",
                "409",
            );

        const validIndustries = [
            "Technology",
            "Education",
            "Real Estate",
            "Retail",
            "Finance",
            "Healthcare",
            "Other",
        ];
        if (industry && !validIndustries.includes(industry))
            return sendError(
                res,
                `Invalid industry. Valid: ${validIndustries.join(", ")}`,
                "400",
            );

        const client = await Client.create({
            owner: req.user.id,
            name: name.trim(),
            contactPerson: contactPerson || undefined,
            phone: phone || undefined,
            email: email ? email.toLowerCase() : undefined,
            industry: industry || "Other",
            notes: notes || undefined,
            icon: icon || "🏢",
            avatarColor: avatarColor || "#E5E7EB",
        });

        return sendSuccess(res, { client }, "Client added successfully.");
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  PATCH /api/clients/:id
//  Body: any subset of { name, contactPerson, phone, email, industry, notes, icon, avatarColor }
// ══════════════════════════════════════════════════════════════
exports.updateClient = async (req, res, next) => {
    try {
        const allowed = [
            "name",
            "contactPerson",
            "phone",
            "email",
            "industry",
            "notes",
            "icon",
            "avatarColor",
        ];
        const updates = {};
        allowed.forEach((k) => {
            if (req.body[k] !== undefined) updates[k] = req.body[k];
        });

        if (!Object.keys(updates).length)
            return sendError(res, "No valid fields provided to update.", "400");

        const validIndustries = [
            "Technology",
            "Education",
            "Real Estate",
            "Retail",
            "Finance",
            "Healthcare",
            "Other",
        ];
        if (updates.industry && !validIndustries.includes(updates.industry))
            return sendError(
                res,
                `Invalid industry. Valid: ${validIndustries.join(", ")}`,
                "400",
            );

        if (updates.name) updates.name = updates.name.trim();
        if (updates.email) updates.email = updates.email.toLowerCase();

        // Duplicate name check (excluding self)
        if (updates.name) {
            const conflict = await Client.findOne({
                owner: req.user.id,
                name: updates.name,
                _id: { $ne: req.params.id },
            });
            if (conflict)
                return sendError(
                    res,
                    "Another client with this name already exists.",
                    "409",
                );
        }

        const client = await Client.findOneAndUpdate(
            { _id: req.params.id, owner: req.user.id },
            { $set: updates },
            { new: true, runValidators: true },
        );
        if (!client) return sendError(res, "Client not found.", "404");

        return sendSuccess(res, { client }, "Client updated successfully.");
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  PATCH /api/clients/:id/status
//  Body: { status: 'active' | 'inactive' }
// ══════════════════════════════════════════════════════════════
exports.updateClientStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!status || !["active", "inactive"].includes(status))
            return sendError(
                res,
                "status must be 'active' or 'inactive'.",
                "400",
            );

        const client = await Client.findOneAndUpdate(
            { _id: req.params.id, owner: req.user.id },
            { $set: { status } },
            { new: true },
        );
        if (!client) return sendError(res, "Client not found.", "404");

        return sendSuccess(res, { client }, `Client marked as ${status}.`);
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  DELETE /api/clients/:id   (soft delete)
//  Blocked if client has active / unpaid projects.
// ══════════════════════════════════════════════════════════════
exports.deleteClient = async (req, res, next) => {
    try {
        const client = await Client.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!client) return sendError(res, "Client not found.", "404");

        // Block deletion if there are active / in-progress projects with pending payments
        const activeProject = await Project.findOne({
            owner: req.user.id,
            client: client.name,
            isArchived: false,
            status: { $in: ["inprogress", "onstay"] },
        }).select("name");

        if (activeProject)
            return sendError(
                res,
                `Cannot remove — "${activeProject.name}" is still active for this client. Complete or archive the project first.`,
                "400",
            );

        client.isActive = false;
        await client.save({ validateBeforeSave: false });

        return sendSuccess(res, null, "Client removed successfully.");
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  GET /api/clients/:id/payment-history
//  Full payment history across all linked projects for one client
// ══════════════════════════════════════════════════════════════
exports.getClientPaymentHistory = async (req, res, next) => {
    try {
        const client = await Client.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!client) return sendError(res, "Client not found.", "404");

        const projects = await Project.find({
            owner: req.user.id,
            client: client.name,
            isArchived: false,
        }).select("name type status clientPayments totalPrice receivedAmount");

        const history = [];

        projects.forEach((p) => {
            (p.clientPayments || []).forEach((pay) => {
                history.push({
                    projectId: p._id,
                    project: p.name,
                    projectStatus: p.status,
                    label: pay.label,
                    amount: pay.amount,
                    date: pay.date,
                    method: pay.method,
                    reference: pay.reference,
                    note: pay.note,
                    status: pay.status,
                    paymentId: pay._id,
                });
            });
        });

        // Sort newest first
        history.sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalReceived = history
            .filter((h) => h.status === "paid")
            .reduce((s, h) => s + h.amount, 0);
        const totalPending = projects.reduce(
            (s, p) => s + (p.totalPrice - p.receivedAmount),
            0,
        );

        return sendSuccess(
            res,
            {
                client: {
                    id: client._id,
                    name: client.name,
                    contactPerson: client.contactPerson,
                    phone: client.phone,
                },
                stats: {
                    totalBilled: +client.totalBilled.toFixed(2),
                    totalReceived: +totalReceived.toFixed(2),
                    totalPending: +Math.max(0, totalPending).toFixed(2),
                    projectCount: projects.length,
                },
                history,
            },
            "Client payment history fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  POST /api/clients/:id/recalculate
//  Force-sync totalBilled, totalReceived, projectCount from live project data
// ══════════════════════════════════════════════════════════════
exports.recalculateClientStats = async (req, res, next) => {
    try {
        const client = await Client.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!client) return sendError(res, "Client not found.", "404");

        const stats = await updateClientStats(client.name, req.user.id);

        return sendSuccess(
            res,
            {
                client: { id: client._id, name: client.name, ...stats },
            },
            "Client stats recalculated successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// Export helper so projectController can call it after project create/update/pay
exports.updateClientStats = updateClientStats;
