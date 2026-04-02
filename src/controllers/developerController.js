const Developer = require('../models/Developer');
const Project   = require('../models/Project');
const { sendSuccess, sendError } = require('../utils/response');

// GET /api/developers?role=Frontend&status=active&search=Zafran
exports.getDevelopers = async (req, res, next) => {
  try {
    const { role, status, search } = req.query;
    const filter = { owner: req.user.id };

    if (status) filter.status = status;
    if (role)   filter.role   = { $regex: role, $options: 'i' };
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { role:  { $regex: search, $options: 'i' } },
      ];
    }

    const devs = await Developer.find(filter).sort({ status: 1, name: 1 });

    const totalPaid    = devs.reduce((s, d) => s + d.totalPaid,    0);
    const totalPending = devs.reduce((s, d) => s + d.totalPending, 0);

    return sendSuccess(res, {
      count: devs.length,
      stats: { totalPaid, totalPending },
      developers: devs,
    }, 'Developers fetched successfully.');
  } catch (err) { next(err); }
};

// GET /api/developers/:id
exports.getDeveloper = async (req, res, next) => {
  try {
    const dev = await Developer.findOne({ _id: req.params.id, owner: req.user.id });
    if (!dev) return sendError(res, 'Developer not found.', '404');

    const projects = await Project.find({
      owner: req.user.id,
      'developers.developer': dev._id,
    }).select('name client status developers.$');

    return sendSuccess(res, { developer: dev, projects }, 'Developer fetched successfully.');
  } catch (err) { next(err); }
};

// POST /api/developers
exports.createDeveloper = async (req, res, next) => {
  try {
    const { name, phone, upiId, role, notes } = req.body;
    if (!name || name.trim().length < 2)
      return sendError(res, 'Developer name (min 2 chars) is required.', '400');

    if (phone) {
      const existing = await Developer.findOne({ owner: req.user.id, phone });
      if (existing) return sendError(res, 'A developer with this phone already exists.', '409');
    }

    const dev = await Developer.create({
      owner: req.user.id,
      name:  name.trim(),
      phone: phone || undefined,
      upiId: upiId || undefined,
      role:  role  || undefined,
      notes: notes || undefined,
    });

    return sendSuccess(res, { developer: dev }, 'Developer added successfully.');
  } catch (err) { next(err); }
};

// PATCH /api/developers/:id
exports.updateDeveloper = async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'upiId', 'role', 'notes', 'status'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    if (updates.status && !['active', 'inactive'].includes(updates.status))
      return sendError(res, 'status must be active or inactive.', '400');

    const dev = await Developer.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!dev) return sendError(res, 'Developer not found.', '404');
    return sendSuccess(res, { developer: dev }, 'Developer updated successfully.');
  } catch (err) { next(err); }
};

// DELETE /api/developers/:id
exports.deleteDeveloper = async (req, res, next) => {
  try {
    const activeProject = await Project.findOne({
      owner: req.user.id,
      'developers.developer': req.params.id,
      'developers.status':    'active',
      status: { $in: ['inprogress', 'onstay'] },
    });

    if (activeProject)
      return sendError(
        res,
        `Cannot delete — developer is active on "${activeProject.name}". Pause or remove them first.`,
        '400'
      );

    const dev = await Developer.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    if (!dev) return sendError(res, 'Developer not found.', '404');
    return sendSuccess(res, null, 'Developer removed successfully.');
  } catch (err) { next(err); }
};

// GET /api/developers/:id/payment-history
exports.getDevPaymentHistory = async (req, res, next) => {
  try {
    const dev = await Developer.findOne({ _id: req.params.id, owner: req.user.id });
    if (!dev) return sendError(res, 'Developer not found.', '404');

    const projects = await Project.find({
      owner: req.user.id,
      'developers.developer': dev._id,
    }).select('name client status developers');

    const history = [];
    projects.forEach(p => {
      const slot = p.developers.find(d => d.developer.toString() === dev._id.toString());
      if (!slot) return;
      slot.payments.forEach(pay => {
        history.push({
          project:      p.name,
          client:       p.client,
          projectId:    p._id,
          amount:       pay.amount,
          date:         pay.date,
          method:       pay.method,
          note:         pay.note,
          agreedAmount: slot.agreedAmount,
          paidAmount:   slot.paidAmount,
        });
      });
    });

    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalPaid    = history.reduce((s, h) => s + h.amount, 0);
    const totalPending = projects.reduce((s, p) => {
      const slot = p.developers.find(d => d.developer.toString() === dev._id.toString());
      return slot ? s + (slot.agreedAmount - slot.paidAmount) : s;
    }, 0);

    return sendSuccess(res, {
      developer: { id: dev._id, name: dev.name, role: dev.role },
      stats:     { totalPaid, totalPending },
      history,
    }, 'Developer payment history fetched successfully.');
  } catch (err) { next(err); }
};
