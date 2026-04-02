const Project   = require('../models/Project');
const Developer = require('../models/Developer');
const { sendSuccess, sendError } = require('../utils/response');

// ═══════════════════════════════════════════════════════════════
//  PROJECTS
// ═══════════════════════════════════════════════════════════════

// GET /api/projects
exports.getProjects = async (req, res, next) => {
  try {
    const { year, status, client, search } = req.query;
    const filter = { owner: req.user.id, isArchived: false };

    if (status)  filter.status = status;
    if (client)  filter.client = { $regex: client, $options: 'i' };
    if (year) {
      filter.startDate = {
        $gte: new Date(`${year}-01-01`),
        $lte: new Date(`${year}-12-31`),
      };
    }
    if (search) {
      filter.$or = [
        { name:   { $regex: search, $options: 'i' } },
        { client: { $regex: search, $options: 'i' } },
        { type:   { $regex: search, $options: 'i' } },
      ];
    }

    const projects = await Project.find(filter)
      .populate('developers.developer', 'name phone role')
      .sort({ startDate: -1 });

    const grouped = {};
    projects.forEach(p => {
      const d   = p.startDate;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    });

    const totalReceived = projects.reduce((s, p) => s + p.receivedAmount, 0);
    const totalPending  = projects.reduce((s, p) => s + p.pendingAmount, 0);
    const activeCount   = projects.filter(p => p.status === 'inprogress').length;

    return sendSuccess(res, {
      count: projects.length,
      stats: { totalReceived, totalPending, activeCount },
      grouped,
      projects,
    }, 'Projects fetched successfully.');
  } catch (err) { next(err); }
};

// GET /api/projects/:id
exports.getProject = async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id })
      .populate('developers.developer', 'name phone role upiId');

    if (!project) return sendError(res, 'Project not found.', '404');
    return sendSuccess(res, { project }, 'Project fetched successfully.');
  } catch (err) { next(err); }
};

// POST /api/projects
exports.createProject = async (req, res, next) => {
  try {
    const { name, type, client, startDate, endDate, totalPrice, developers } = req.body;

    if (!name || !client || !startDate || !totalPrice)
      return sendError(res, 'name, client, startDate and totalPrice are required.', '400');
    if (isNaN(Number(totalPrice)) || Number(totalPrice) <= 0)
      return sendError(res, 'totalPrice must be a positive number.', '400');

    let devSlots = [];
    if (developers && developers.length) {
      for (const d of developers) {
        if (!d.developer || !d.agreedAmount) continue;
        const dev = await Developer.findOne({ _id: d.developer, owner: req.user.id });
        if (!dev) return sendError(res, `Developer ${d.developer} not found.`, '400');
        devSlots.push({
          developer:    dev._id,
          role:         d.role || dev.role,
          agreedAmount: Number(d.agreedAmount),
          status:       'active',
        });
      }
    }

    const project = await Project.create({
      owner:      req.user.id,
      name:       name.trim(),
      type:       type || 'Development',
      client:     client.trim(),
      startDate:  new Date(startDate),
      endDate:    endDate ? new Date(endDate) : undefined,
      totalPrice: Number(totalPrice),
      developers: devSlots,
    });

    if (devSlots.length) {
      await Developer.updateMany(
        { _id: { $in: devSlots.map(d => d.developer) } },
        { $inc: { projectCount: 1 } }
      );
    }

    return sendSuccess(res, { project }, 'Project created successfully.');
  } catch (err) { next(err); }
};

// PATCH /api/projects/:id
exports.updateProject = async (req, res, next) => {
  try {
    const allowed = ['name', 'type', 'client', 'startDate', 'endDate', 'totalPrice', 'status', 'tags'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    if (updates.status) {
      const valid = ['inactive', 'inprogress', 'onstay', 'completed', 'cancelled'];
      if (!valid.includes(updates.status))
        return sendError(res, 'Invalid status.', '400');
    }

    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!project) return sendError(res, 'Project not found.', '404');
    return sendSuccess(res, { project }, 'Project updated successfully.');
  } catch (err) { next(err); }
};

// DELETE /api/projects/:id
exports.deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { isArchived: true },
      { new: true }
    );
    if (!project) return sendError(res, 'Project not found.', '404');
    return sendSuccess(res, null, 'Project archived successfully.');
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════
//  CLIENT PAYMENTS
// ═══════════════════════════════════════════════════════════════

// POST /api/projects/:id/client-payments
exports.addClientPayment = async (req, res, next) => {
  try {
    const { label, amount, date, method, reference, note, status } = req.body;

    if (!label || !amount || !date)
      return sendError(res, 'label, amount and date are required.', '400');
    if (isNaN(Number(amount)) || Number(amount) <= 0)
      return sendError(res, 'amount must be positive.', '400');

    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return sendError(res, 'Project not found.', '404');

    project.clientPayments.push({
      label,
      amount:    Number(amount),
      date:      new Date(date),
      method:    method    || 'upi',
      reference: reference || '',
      note:      note      || '',
      status:    status    || 'paid',
    });

    await project.save();

    return sendSuccess(res, {
      receivedAmount: project.receivedAmount,
      pendingAmount:  project.pendingAmount,
      clientPayments: project.clientPayments,
    }, 'Client payment recorded successfully.');
  } catch (err) { next(err); }
};

// PATCH /api/projects/:id/client-payments/:paymentId
exports.updateClientPayment = async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return sendError(res, 'Project not found.', '404');

    const payment = project.clientPayments.id(req.params.paymentId);
    if (!payment) return sendError(res, 'Payment not found.', '404');

    const fields = ['label', 'amount', 'date', 'method', 'reference', 'note', 'status'];
    fields.forEach(f => { if (req.body[f] !== undefined) payment[f] = req.body[f]; });
    if (req.body.amount) payment.amount = Number(req.body.amount);

    await project.save();
    return sendSuccess(res, { payment }, 'Client payment updated successfully.');
  } catch (err) { next(err); }
};

// DELETE /api/projects/:id/client-payments/:paymentId
exports.deleteClientPayment = async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return sendError(res, 'Project not found.', '404');

    project.clientPayments.pull({ _id: req.params.paymentId });
    await project.save();
    return sendSuccess(res, null, 'Client payment deleted successfully.');
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════
//  DEVELOPER ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════

// POST /api/projects/:id/developers
exports.addDevToProject = async (req, res, next) => {
  try {
    const { developer, role, agreedAmount } = req.body;
    if (!developer || !agreedAmount)
      return sendError(res, 'developer and agreedAmount are required.', '400');

    const dev = await Developer.findOne({ _id: developer, owner: req.user.id });
    if (!dev) return sendError(res, 'Developer not found.', '404');

    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return sendError(res, 'Project not found.', '404');

    const alreadyAdded = project.developers.some(d => d.developer.toString() === developer);
    if (alreadyAdded) return sendError(res, 'Developer already on this project.', '409');

    project.developers.push({
      developer:    dev._id,
      role:         role || dev.role,
      agreedAmount: Number(agreedAmount),
    });
    await project.save();
    await Developer.findByIdAndUpdate(dev._id, { $inc: { projectCount: 1 } });

    return sendSuccess(res, { developers: project.developers }, 'Developer added to project successfully.');
  } catch (err) { next(err); }
};

// PATCH /api/projects/:id/developers/:devId/status
exports.updateDevStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'paused', 'removed'].includes(status))
      return sendError(res, 'status must be active, paused, or removed.', '400');

    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return sendError(res, 'Project not found.', '404');

    const slot = project.developers.id(req.params.devId);
    if (!slot) return sendError(res, 'Developer slot not found.', '404');

    slot.status = status;
    await project.save();
    return sendSuccess(res, { slot }, `Developer ${status} successfully.`);
  } catch (err) { next(err); }
};

// POST /api/projects/:id/developers/:devId/pay
exports.payDeveloper = async (req, res, next) => {
  try {
    const { amount, date, method, note } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
      return sendError(res, 'Valid amount is required.', '400');

    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return sendError(res, 'Project not found.', '404');

    const slot = project.developers.id(req.params.devId);
    if (!slot) return sendError(res, 'Developer slot not found.', '404');

    const newPaid = slot.paidAmount + Number(amount);
    if (newPaid > slot.agreedAmount)
      return sendError(
        res,
        `Payment ₹${amount} would exceed agreed amount ₹${slot.agreedAmount}. Remaining: ₹${slot.agreedAmount - slot.paidAmount}`,
        '400'
      );

    slot.payments.push({
      amount: Number(amount),
      date:   date ? new Date(date) : new Date(),
      method: method || 'upi',
      note:   note   || '',
    });

    await project.save();

    const remaining = slot.agreedAmount - slot.paidAmount;
    await Developer.findByIdAndUpdate(slot.developer, {
      $inc: { totalPaid: Number(amount), totalPending: -Number(amount) },
    });

    return sendSuccess(res, {
      paidAmount: slot.paidAmount,
      remaining,
      payments:   slot.payments,
    }, 'Developer payment recorded successfully.');
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════
//  REPORT SUMMARY
// ═══════════════════════════════════════════════════════════════

// GET /api/projects/summary?year=2026
exports.getProjectSummary = async (req, res, next) => {
  try {
    const year = req.query.year || new Date().getFullYear();

    const projects = await Project.find({
      owner:      req.user.id,
      isArchived: false,
      startDate:  { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) },
    });

    const totalReceived = projects.reduce((s, p) => s + p.receivedAmount, 0);
    const totalPending  = projects.reduce((s, p) => s + p.pendingAmount, 0);
    const totalBilled   = projects.reduce((s, p) => s + p.totalPrice, 0);

    let totalDevPaid = 0;
    projects.forEach(p => {
      p.developers.forEach(d => { totalDevPaid += d.paidAmount || 0; });
    });

    const byStatus = projects.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {});

    const byClient = {};
    projects.forEach(p => {
      if (!byClient[p.client]) byClient[p.client] = 0;
      byClient[p.client] += p.receivedAmount;
    });

    return sendSuccess(res, {
      year: Number(year),
      summary: {
        totalBilled,
        totalReceived,
        totalPending,
        totalDevPaid,
        netProfit:    totalReceived - totalDevPaid,
        projectCount: projects.length,
        byStatus,
        byClient,
      },
    }, 'Project summary fetched successfully.');
  } catch (err) { next(err); }
};
