const Developer = require('../models/Developer');
const Project   = require('../models/Project');

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

    res.status(200).json({
      success: true,
      count: devs.length,
      stats: { totalPaid, totalPending },
      developers: devs,
    });
  } catch (err) { next(err); }
};

// GET /api/developers/:id
exports.getDeveloper = async (req, res, next) => {
  try {
    const dev = await Developer.findOne({ _id: req.params.id, owner: req.user.id });
    if (!dev) return res.status(404).json({ success: false, message: 'Developer not found.' });

    // Get all projects this dev is on
    const projects = await Project.find({
      owner: req.user.id,
      'developers.developer': dev._id,
    }).select('name client status developers.$');

    res.status(200).json({ success: true, developer: dev, projects });
  } catch (err) { next(err); }
};

// POST /api/developers
exports.createDeveloper = async (req, res, next) => {
  try {
    const { name, phone, upiId, role, notes } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Developer name (min 2 chars) is required.' });
    }

    // Check for duplicate phone under same owner
    if (phone) {
      const existing = await Developer.findOne({ owner: req.user.id, phone });
      if (existing) return res.status(409).json({ success: false, message: 'A developer with this phone already exists.' });
    }

    const dev = await Developer.create({
      owner: req.user.id,
      name:  name.trim(),
      phone: phone || undefined,
      upiId: upiId || undefined,
      role:  role  || undefined,
      notes: notes || undefined,
    });

    res.status(201).json({ success: true, message: 'Developer added.', developer: dev });
  } catch (err) { next(err); }
};

// PATCH /api/developers/:id
exports.updateDeveloper = async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'upiId', 'role', 'notes', 'status'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    if (updates.status && !['active', 'inactive'].includes(updates.status)) {
      return res.status(400).json({ success: false, message: 'status must be active or inactive.' });
    }

    const dev = await Developer.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!dev) return res.status(404).json({ success: false, message: 'Developer not found.' });
    res.status(200).json({ success: true, message: 'Developer updated.', developer: dev });
  } catch (err) { next(err); }
};

// DELETE /api/developers/:id
exports.deleteDeveloper = async (req, res, next) => {
  try {
    // Check dev is not on any active project
    const activeProject = await Project.findOne({
      owner: req.user.id,
      'developers.developer': req.params.id,
      'developers.status': 'active',
      status: { $in: ['inprogress', 'onstay'] },
    });
    if (activeProject) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete — developer is active on "${activeProject.name}". Pause or remove them first.`,
      });
    }

    const dev = await Developer.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    if (!dev) return res.status(404).json({ success: false, message: 'Developer not found.' });
    res.status(200).json({ success: true, message: 'Developer removed.' });
  } catch (err) { next(err); }
};

// GET /api/developers/:id/payment-history
// Full cross-project payment history for one developer
exports.getDevPaymentHistory = async (req, res, next) => {
  try {
    const dev = await Developer.findOne({ _id: req.params.id, owner: req.user.id });
    if (!dev) return res.status(404).json({ success: false, message: 'Developer not found.' });

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

    res.status(200).json({
      success: true,
      developer: { id: dev._id, name: dev.name, role: dev.role },
      stats: { totalPaid, totalPending },
      history,
    });
  } catch (err) { next(err); }
};
