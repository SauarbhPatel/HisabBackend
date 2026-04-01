const Project   = require('../models/Project');
const Developer = require('../models/Developer');

// ═══════════════════════════════════════════════════════════════
//  PROJECTS
// ═══════════════════════════════════════════════════════════════

// GET /api/projects
// Query: ?year=2026 &status=inprogress &client=Maksoft &search=ERP
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

    // Group by month for the frontend "month group labels"
    const grouped = {};
    projects.forEach(p => {
      const d   = p.startDate;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    });

    // Summary stats
    const totalReceived  = projects.reduce((s, p) => s + p.receivedAmount, 0);
    const totalPending   = projects.reduce((s, p) => s + p.pendingAmount, 0);
    const activeCount    = projects.filter(p => p.status === 'inprogress').length;

    res.status(200).json({
      success: true,
      count: projects.length,
      stats: { totalReceived, totalPending, activeCount },
      grouped,
      projects,
    });
  } catch (err) { next(err); }
};

// GET /api/projects/:id
exports.getProject = async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id })
      .populate('developers.developer', 'name phone role upiId');

    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
    res.status(200).json({ success: true, project });
  } catch (err) { next(err); }
};

// POST /api/projects
exports.createProject = async (req, res, next) => {
  try {
    const { name, type, client, startDate, endDate, totalPrice, developers } = req.body;

    if (!name || !client || !startDate || !totalPrice) {
      return res.status(400).json({ success: false, message: 'name, client, startDate and totalPrice are required.' });
    }
    if (isNaN(Number(totalPrice)) || Number(totalPrice) <= 0) {
      return res.status(400).json({ success: false, message: 'totalPrice must be a positive number.' });
    }

    // Validate developer IDs belong to this user
    let devSlots = [];
    if (developers && developers.length) {
      for (const d of developers) {
        if (!d.developer || !d.agreedAmount) continue;
        const dev = await Developer.findOne({ _id: d.developer, owner: req.user.id });
        if (!dev) return res.status(400).json({ success: false, message: `Developer ${d.developer} not found.` });
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

    // Bump projectCount on each dev
    if (devSlots.length) {
      await Developer.updateMany(
        { _id: { $in: devSlots.map(d => d.developer) } },
        { $inc: { projectCount: 1 } }
      );
    }

    res.status(201).json({ success: true, message: 'Project created!', project });
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
      if (!valid.includes(updates.status)) {
        return res.status(400).json({ success: false, message: 'Invalid status.' });
      }
    }

    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
    res.status(200).json({ success: true, message: 'Project updated.', project });
  } catch (err) { next(err); }
};

// DELETE /api/projects/:id  (soft delete — archive)
exports.deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { isArchived: true },
      { new: true }
    );
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
    res.status(200).json({ success: true, message: 'Project archived.' });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════
//  CLIENT PAYMENTS
// ═══════════════════════════════════════════════════════════════

// POST /api/projects/:id/client-payments
exports.addClientPayment = async (req, res, next) => {
  try {
    const { label, amount, date, method, reference, note, status } = req.body;

    if (!label || !amount || !date) {
      return res.status(400).json({ success: false, message: 'label, amount and date are required.' });
    }
    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'amount must be positive.' });
    }

    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    project.clientPayments.push({
      label,
      amount:    Number(amount),
      date:      new Date(date),
      method:    method   || 'upi',
      reference: reference || '',
      note:      note     || '',
      status:    status   || 'paid',
    });

    await project.save(); // pre-save hook recalculates receivedAmount

    res.status(201).json({
      success: true,
      message: 'Payment recorded.',
      receivedAmount: project.receivedAmount,
      pendingAmount:  project.pendingAmount,
      clientPayments: project.clientPayments,
    });
  } catch (err) { next(err); }
};

// PATCH /api/projects/:id/client-payments/:paymentId
exports.updateClientPayment = async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const payment = project.clientPayments.id(req.params.paymentId);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });

    const fields = ['label', 'amount', 'date', 'method', 'reference', 'note', 'status'];
    fields.forEach(f => { if (req.body[f] !== undefined) payment[f] = req.body[f]; });
    if (req.body.amount) payment.amount = Number(req.body.amount);

    await project.save();
    res.status(200).json({ success: true, message: 'Payment updated.', payment });
  } catch (err) { next(err); }
};

// DELETE /api/projects/:id/client-payments/:paymentId
exports.deleteClientPayment = async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    project.clientPayments.pull({ _id: req.params.paymentId });
    await project.save();
    res.status(200).json({ success: true, message: 'Payment deleted.' });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════
//  DEVELOPER ASSIGNMENTS ON A PROJECT
// ═══════════════════════════════════════════════════════════════

// POST /api/projects/:id/developers   — add dev to project
exports.addDevToProject = async (req, res, next) => {
  try {
    const { developer, role, agreedAmount } = req.body;
    if (!developer || !agreedAmount) {
      return res.status(400).json({ success: false, message: 'developer and agreedAmount are required.' });
    }

    const dev = await Developer.findOne({ _id: developer, owner: req.user.id });
    if (!dev) return res.status(404).json({ success: false, message: 'Developer not found.' });

    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const alreadyAdded = project.developers.some(d => d.developer.toString() === developer);
    if (alreadyAdded) return res.status(409).json({ success: false, message: 'Developer already on this project.' });

    project.developers.push({
      developer:    dev._id,
      role:         role || dev.role,
      agreedAmount: Number(agreedAmount),
    });
    await project.save();
    await Developer.findByIdAndUpdate(dev._id, { $inc: { projectCount: 1 } });

    res.status(201).json({ success: true, message: 'Developer added to project.', developers: project.developers });
  } catch (err) { next(err); }
};

// PATCH /api/projects/:id/developers/:devId/status
exports.updateDevStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'paused', 'removed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be active, paused, or removed.' });
    }

    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const slot = project.developers.id(req.params.devId);
    if (!slot) return res.status(404).json({ success: false, message: 'Developer slot not found.' });

    slot.status = status;
    await project.save();
    res.status(200).json({ success: true, message: `Developer ${status}.`, slot });
  } catch (err) { next(err); }
};

// POST /api/projects/:id/developers/:devId/pay  — record dev payment
exports.payDeveloper = async (req, res, next) => {
  try {
    const { amount, date, method, note } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required.' });
    }

    const project = await Project.findOne({ _id: req.params.id, owner: req.user.id });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const slot = project.developers.id(req.params.devId);
    if (!slot) return res.status(404).json({ success: false, message: 'Developer slot not found.' });

    const newPaid = slot.paidAmount + Number(amount);
    if (newPaid > slot.agreedAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment ₹${amount} would exceed agreed amount ₹${slot.agreedAmount}. Remaining: ₹${slot.agreedAmount - slot.paidAmount}`,
      });
    }

    slot.payments.push({
      amount: Number(amount),
      date:   date ? new Date(date) : new Date(),
      method: method || 'upi',
      note:   note   || '',
    });

    await project.save(); // pre-save recalculates paidAmount

    // Update dev aggregate stats
    const remaining = slot.agreedAmount - slot.paidAmount;
    await Developer.findByIdAndUpdate(slot.developer, {
      $inc: { totalPaid: Number(amount), totalPending: -Number(amount) },
    });

    res.status(201).json({
      success: true,
      message: 'Developer payment recorded.',
      paidAmount:   slot.paidAmount,
      remaining,
      payments: slot.payments,
    });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════
//  REPORT SUMMARY  (for projects screen header)
// ═══════════════════════════════════════════════════════════════

// GET /api/projects/summary?year=2026
exports.getProjectSummary = async (req, res, next) => {
  try {
    const year = req.query.year || new Date().getFullYear();

    const projects = await Project.find({
      owner: req.user.id,
      isArchived: false,
      startDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) },
    });

    const totalReceived = projects.reduce((s, p) => s + p.receivedAmount, 0);
    const totalPending  = projects.reduce((s, p) => s + p.pendingAmount, 0);
    const totalBilled   = projects.reduce((s, p) => s + p.totalPrice, 0);

    // Dev payments paid out
    let totalDevPaid = 0;
    projects.forEach(p => {
      p.developers.forEach(d => { totalDevPaid += d.paidAmount || 0; });
    });

    const byStatus = projects.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {});

    // Income by client
    const byClient = {};
    projects.forEach(p => {
      if (!byClient[p.client]) byClient[p.client] = 0;
      byClient[p.client] += p.receivedAmount;
    });

    res.status(200).json({
      success: true,
      year: Number(year),
      summary: {
        totalBilled,
        totalReceived,
        totalPending,
        totalDevPaid,
        netProfit: totalReceived - totalDevPaid,
        projectCount: projects.length,
        byStatus,
        byClient,
      },
    });
  } catch (err) { next(err); }
};
