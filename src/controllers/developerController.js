const Developer = require("../models/Developer");
const Project = require("../models/Project");
const { sendSuccess, sendError } = require("../utils/response");

// ─── Helper: recompute & persist totalPaid / totalPending for a developer ─
// Call this after any payment change in Project to keep Developer in sync.
const updateDevStats = async (devId, ownerId) => {
    const projects = await Project.find({
        owner: ownerId,
        "developers.developer": devId,
    }).select("developers");

    let totalPaid = 0;
    let totalPending = 0;
    let projectCount = 0;

    projects.forEach((p) => {
        const slot = p.developers.find(
            (d) => d.developer.toString() === devId.toString(),
        );
        if (!slot) return;
        projectCount += 1;
        totalPaid += slot.paidAmount || 0;
        totalPending += Math.max(
            0,
            (slot.agreedAmount || 0) - (slot.paidAmount || 0),
        );
    });

    await Developer.findByIdAndUpdate(devId, {
        totalPaid,
        totalPending,
        projectCount,
    });
    return { totalPaid, totalPending, projectCount };
};

// ══════════════════════════════════════════════════════════════
//  GET /api/developers
//  Query: ?role=Frontend&status=active&search=Zafran
// ══════════════════════════════════════════════════════════════
exports.getDevelopers = async (req, res, next) => {
    try {
        const { role, status, search } = req.query;
        const filter = { owner: req.user.id };

        if (status) filter.status = status;
        if (role) filter.role = { $regex: role, $options: "i" };
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } },
                { role: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }

        const devs = await Developer.find(filter).sort({ status: 1, name: 1 });

        const totalPaid = devs.reduce((s, d) => s + (d.totalPaid || 0), 0);
        const totalPending = devs.reduce(
            (s, d) => s + (d.totalPending || 0),
            0,
        );

        return sendSuccess(
            res,
            {
                count: devs.length,
                stats: {
                    totalPaid: +totalPaid.toFixed(2),
                    totalPending: +totalPending.toFixed(2),
                },
                developers: devs,
            },
            "Developers fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  GET /api/developers/:id
// ══════════════════════════════════════════════════════════════
exports.getDeveloper = async (req, res, next) => {
    try {
        const dev = await Developer.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!dev) return sendError(res, "Developer not found.", "404");

        // Fetch projects this dev is assigned to (with their slot details)
        const projects = await Project.find({
            owner: req.user.id,
            "developers.developer": dev._id,
        }).select("name client status startDate endDate developers");

        // Attach slot summary to each project for convenience
        const projectSummary = projects.map((p) => {
            const slot = p.developers.find(
                (d) => d.developer.toString() === dev._id.toString(),
            );
            return {
                _id: p._id,
                name: p.name,
                client: p.client,
                status: p.status,
                startDate: p.startDate,
                endDate: p.endDate,
                role: slot?.role,
                agreedAmount: slot?.agreedAmount,
                paidAmount: slot?.paidAmount,
                pending: Math.max(
                    0,
                    (slot?.agreedAmount || 0) - (slot?.paidAmount || 0),
                ),
                devStatus: slot?.status,
                payments: slot?.payments || [],
            };
        });

        return sendSuccess(
            res,
            { developer: dev, projects: projectSummary },
            "Developer fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  POST /api/developers
//  Body: { name, phone?, email?, upiId?, role?, notes? }
// ══════════════════════════════════════════════════════════════
exports.createDeveloper = async (req, res, next) => {
    try {
        const { name, phone, email, upiId, role, notes } = req.body;

        if (!name || name.trim().length < 2)
            return sendError(
                res,
                "Developer name (min 2 chars) is required.",
                "400",
            );

        if (phone) {
            const existing = await Developer.findOne({
                owner: req.user.id,
                phone: phone.trim(),
            });
            if (existing)
                return sendError(
                    res,
                    "A developer with this phone already exists.",
                    "409",
                );
        }

        if (email) {
            const existing = await Developer.findOne({
                owner: req.user.id,
                email: email.toLowerCase(),
            });
            if (existing)
                return sendError(
                    res,
                    "A developer with this email already exists.",
                    "409",
                );
        }

        const dev = await Developer.create({
            owner: req.user.id,
            name: name.trim(),
            phone: phone || undefined,
            email: email ? email.toLowerCase() : undefined,
            upiId: upiId || undefined,
            role: role || undefined,
            notes: notes || undefined,
        });

        return sendSuccess(
            res,
            { developer: dev },
            "Developer added successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  PATCH /api/developers/:id
//  Body: any subset of { name, phone, email, upiId, role, notes, status }
// ══════════════════════════════════════════════════════════════
exports.updateDeveloper = async (req, res, next) => {
    try {
        const allowed = [
            "name",
            "phone",
            "email",
            "upiId",
            "role",
            "notes",
            "status",
        ];
        const updates = {};
        allowed.forEach((k) => {
            if (req.body[k] !== undefined) updates[k] = req.body[k];
        });

        if (updates.status && !["active", "inactive"].includes(updates.status))
            return sendError(
                res,
                "status must be 'active' or 'inactive'.",
                "400",
            );

        if (updates.email) updates.email = updates.email.toLowerCase();
        if (updates.name) updates.name = updates.name.trim();

        // Duplicate phone / email check (excluding self)
        if (updates.phone) {
            const conflict = await Developer.findOne({
                owner: req.user.id,
                phone: updates.phone,
                _id: { $ne: req.params.id },
            });
            if (conflict)
                return sendError(
                    res,
                    "Another developer with this phone already exists.",
                    "409",
                );
        }
        if (updates.email) {
            const conflict = await Developer.findOne({
                owner: req.user.id,
                email: updates.email,
                _id: { $ne: req.params.id },
            });
            if (conflict)
                return sendError(
                    res,
                    "Another developer with this email already exists.",
                    "409",
                );
        }

        const dev = await Developer.findOneAndUpdate(
            { _id: req.params.id, owner: req.user.id },
            { $set: updates },
            { new: true, runValidators: true },
        );
        if (!dev) return sendError(res, "Developer not found.", "404");

        return sendSuccess(
            res,
            { developer: dev },
            "Developer updated successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  DELETE /api/developers/:id
//  Blocked if developer is active on any in-progress project.
// ══════════════════════════════════════════════════════════════
exports.deleteDeveloper = async (req, res, next) => {
    try {
        const activeProject = await Project.findOne({
            owner: req.user.id,
            "developers.developer": req.params.id,
            "developers.status": "active",
            status: { $in: ["inprogress", "onstay"] },
        }).select("name");

        if (activeProject)
            return sendError(
                res,
                `Cannot delete — developer is currently active on "${activeProject.name}". Pause or remove them from the project first.`,
                "400",
            );

        const dev = await Developer.findOneAndDelete({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!dev) return sendError(res, "Developer not found.", "404");

        return sendSuccess(res, null, "Developer removed successfully.");
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  GET /api/developers/:id/payment-history
//  Full cross-project payment history for a developer.
// ══════════════════════════════════════════════════════════════
exports.getDevPaymentHistory = async (req, res, next) => {
    try {
        const dev = await Developer.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!dev) return sendError(res, "Developer not found.", "404");

        const projects = await Project.find({
            owner: req.user.id,
            "developers.developer": dev._id,
        }).select("name client status developers");

        const history = [];

        projects.forEach((p) => {
            const slot = p.developers.find(
                (d) => d.developer.toString() === dev._id.toString(),
            );
            if (!slot) return;

            (slot.payments || []).forEach((pay) => {
                history.push({
                    projectId: p._id,
                    project: p.name,
                    client: p.client,
                    projectStatus: p.status,
                    amount: pay.amount,
                    date: pay.date,
                    method: pay.method,
                    note: pay.note,
                    agreedAmount: slot.agreedAmount,
                    paidToDate: slot.paidAmount,
                });
            });
        });

        // Sort newest first
        history.sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalPaid = history.reduce((s, h) => s + h.amount, 0);
        const totalPending = projects.reduce((s, p) => {
            const slot = p.developers.find(
                (d) => d.developer.toString() === dev._id.toString(),
            );
            if (!slot) return s;
            return (
                s +
                Math.max(0, (slot.agreedAmount || 0) - (slot.paidAmount || 0))
            );
        }, 0);

        return sendSuccess(
            res,
            {
                developer: {
                    id: dev._id,
                    name: dev.name,
                    role: dev.role,
                    upiId: dev.upiId,
                },
                stats: {
                    totalPaid: +totalPaid.toFixed(2),
                    totalPending: +totalPending.toFixed(2),
                    projectCount: projects.length,
                },
                history,
            },
            "Developer payment history fetched successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════
//  POST /api/developers/:id/recalculate
//  Force-recalculate totalPaid / totalPending / projectCount
//  from live project data. Useful after data corrections.
// ══════════════════════════════════════════════════════════════
exports.recalculateDevStats = async (req, res, next) => {
    try {
        const dev = await Developer.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });
        if (!dev) return sendError(res, "Developer not found.", "404");

        const stats = await updateDevStats(dev._id, req.user.id);

        return sendSuccess(
            res,
            { developer: { id: dev._id, name: dev.name, ...stats } },
            "Developer stats recalculated successfully.",
        );
    } catch (err) {
        next(err);
    }
};

// Export helper so projectController can call it after payments
exports.updateDevStats = updateDevStats;
