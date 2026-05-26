const express = require('express');
const bcrypt  = require('bcryptjs');
const prisma  = require('../lib/prisma');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ── USERS ─────────────────────────────────────────────────────────────────────
router.get('/', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, carrierId: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch (err) { next(err); }
});

router.post('/', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const { password, ...rest } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const user   = await prisma.user.create({ data: { ...rest, password: hashed } });
    const { password: _, ...safe } = user;
    res.status(201).json(safe);
  } catch (err) { next(err); }
});

router.patch('/:id', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const { password, ...rest } = req.body;
    const data = { ...rest };
    if (password) data.password = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    const { password: _, ...safe } = user;
    res.json(safe);
  } catch (err) { next(err); }
});

module.exports = router;
