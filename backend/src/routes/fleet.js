const express = require('express');
const prisma  = require('../lib/prisma');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ── TRUCKS ────────────────────────────────────────────────────────────────────

router.get('/trucks', authenticate, async (req, res, next) => {
  try {
    const { status, type } = req.query;
    const where = { isActive: true };
    if (status) where.status = status;
    if (type)   where.type   = type;

    const trucks = await prisma.truck.findMany({
      where,
      include: {
        drivers: { where: { isActive: true }, select: { id: true, name: true, status: true, currentHosDriving: true } },
        loads:   { where: { status: { in: ['ASSIGNED', 'IN_TRANSIT', 'AT_PICKUP', 'AT_DELIVERY'] } }, select: { id: true, loadNumber: true }, take: 1 },
      },
      orderBy: { unitNumber: 'asc' },
    });
    res.json(trucks);
  } catch (err) { next(err); }
});

router.get('/trucks/:id', authenticate, async (req, res, next) => {
  try {
    const truck = await prisma.truck.findUnique({
      where:   { id: req.params.id },
      include: { drivers: true, loads: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!truck) return res.status(404).json({ message: 'Truck not found' });
    res.json(truck);
  } catch (err) { next(err); }
});

router.post('/trucks', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'), async (req, res, next) => {
  try {
    const truck = await prisma.truck.create({ data: req.body });
    res.status(201).json(truck);
  } catch (err) { next(err); }
});

router.patch('/trucks/:id', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'), async (req, res, next) => {
  try {
    const truck = await prisma.truck.update({ where: { id: req.params.id }, data: req.body });
    res.json(truck);
  } catch (err) { next(err); }
});

// PATCH /api/fleet/trucks/:id/location — GPS position update
router.patch('/trucks/:id/location', authenticate, async (req, res, next) => {
  try {
    const { lat, lng, location } = req.body;
    const truck = await prisma.truck.update({
      where: { id: req.params.id },
      data: { currentLat: lat, currentLng: lng, currentLocation: location },
    });
    const io = req.app.get('io');
    io?.emit('truck:locationUpdate', { truckId: truck.id, lat, lng, location });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── DRIVERS ───────────────────────────────────────────────────────────────────

router.get('/drivers', authenticate, async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = { isActive: true };
    if (status) where.status = status;

    const drivers = await prisma.driver.findMany({
      where,
      include: {
        carrier: { select: { id: true, name: true } },
        loads:   { where: { status: { in: ['ASSIGNED', 'IN_TRANSIT'] } }, select: { id: true, loadNumber: true }, take: 1 },
      },
      orderBy: { name: 'asc' },
    });
    res.json(drivers);
  } catch (err) { next(err); }
});

router.get('/drivers/:id', authenticate, async (req, res, next) => {
  try {
    const driver = await prisma.driver.findUnique({
      where:   { id: req.params.id },
      include: { loads: { orderBy: { createdAt: 'desc' }, take: 10 }, hosAlerts: { orderBy: { createdAt: 'desc' }, take: 10 }, hosLogs: { orderBy: { startAt: 'desc' }, take: 20 } },
    });
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    res.json(driver);
  } catch (err) { next(err); }
});

router.post('/drivers', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'), async (req, res, next) => {
  try {
    const driver = await prisma.driver.create({ data: req.body });
    res.status(201).json(driver);
  } catch (err) { next(err); }
});

router.patch('/drivers/:id', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'), async (req, res, next) => {
  try {
    const driver = await prisma.driver.update({ where: { id: req.params.id }, data: req.body });
    res.json(driver);
  } catch (err) { next(err); }
});

module.exports = router;
