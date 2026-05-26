const express = require('express');
const prisma  = require('../lib/prisma');
const { authenticate, authorize } = require('../middleware/auth');
const { generateMatches }         = require('../engines/matchingEngine');
const { recalcETA }               = require('../engines/etaEngine');
const { v4: uuidv4 }              = require('uuid');

const router = express.Router();
const DISPATCH_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'];

// GET /api/loads  — board view, filter by status
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, driverId, truckId, page = 1, limit = 50 } = req.query;
    const where = {};
    if (status)   where.status   = { in: status.split(',') };
    if (driverId) where.driverId = driverId;
    if (truckId)  where.truckId  = truckId;

    // DRIVER role sees only their own loads
    if (req.user.role === 'DRIVER' && req.user.driverId) {
      where.driverId = req.user.driverId;
    }

    const [loads, total] = await Promise.all([
      prisma.load.findMany({
        where,
        include: {
          truck:  { select: { id: true, unitNumber: true, type: true } },
          driver: { select: { id: true, name: true, currentHosDriving: true, status: true } },
          shipper:{ select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip:  (Number(page) - 1) * Number(limit),
        take:  Number(limit),
      }),
      prisma.load.count({ where }),
    ]);

    res.json({ loads, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// GET /api/loads/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const load = await prisma.load.findUnique({
      where:   { id: req.params.id },
      include: {
        truck:            { select: { id: true, unitNumber: true, type: true, currentLat: true, currentLng: true } },
        driver:           { select: { id: true, name: true, phone: true, currentHosDriving: true, currentHosWeekly: true, status: true, hosRuleSet: true } },
        shipper:          { select: { id: true, name: true, city: true, state: true } },
        trackingEvents:   { orderBy: { recordedAt: 'desc' }, take: 20 },
        documents:        true,
        matchSuggestions: {
          orderBy: { rank: 'asc' },
          include: {
            truck:  { select: { id: true, unitNumber: true, type: true } },
            driver: { select: { id: true, name: true, currentHosDriving: true } },
          },
        },
        hosAlerts: { where: { isRead: false }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!load) return res.status(404).json({ message: 'Load not found' });
    res.json(load);
  } catch (err) { next(err); }
});

// POST /api/loads — create a new load
router.post('/', authenticate, authorize(...DISPATCH_ROLES, 'OPERATOR'), async (req, res, next) => {
  try {
    const data = req.body;
    const loadNumber = `LD-${Date.now().toString(36).toUpperCase()}`;

    const load = await prisma.load.create({
      data: {
        loadNumber,
        ...data,
        createdById: req.user.id,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: { userId: req.user.id, action: 'CREATE', entity: 'LOAD', entityId: load.id },
    });

    // Auto-generate match suggestions
    try { await generateMatches(load.id); } catch (e) { console.error('Match gen failed:', e.message); }

    const io = req.app.get('io');
    io?.emit('load:created', { id: load.id, loadNumber, status: load.status });

    res.status(201).json(load);
  } catch (err) { next(err); }
});

// PATCH /api/loads/:id — update load fields
router.patch('/:id', authenticate, authorize(...DISPATCH_ROLES, 'OPERATOR'), async (req, res, next) => {
  try {
    const load = await prisma.load.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    await prisma.activityLog.create({
      data: { userId: req.user.id, action: 'UPDATE', entity: 'LOAD', entityId: load.id, metadata: req.body },
    });
    res.json(load);
  } catch (err) { next(err); }
});

// POST /api/loads/:id/assign — assign truck + driver → dispatch
router.post('/:id/assign', authenticate, authorize(...DISPATCH_ROLES), async (req, res, next) => {
  try {
    const { truckId, driverId } = req.body;
    if (!truckId || !driverId) return res.status(400).json({ message: 'truckId and driverId required' });

    const [truck, driver] = await Promise.all([
      prisma.truck.findUnique({ where: { id: truckId } }),
      prisma.driver.findUnique({ where: { id: driverId } }),
    ]);
    if (!truck)  return res.status(404).json({ message: 'Truck not found' });
    if (!driver) return res.status(404).json({ message: 'Driver not found' });

    const load = await prisma.load.update({
      where: { id: req.params.id },
      data: {
        truckId, driverId,
        status:         'ASSIGNED',
        dispatchedAt:   new Date(),
        dispatchedById: req.user.id,
      },
      include: {
        truck:  { select: { id: true, unitNumber: true, type: true } },
        driver: { select: { id: true, name: true } },
      },
    });

    // Update truck + driver status
    await Promise.all([
      prisma.truck.update({ where: { id: truckId }, data: { status: 'ON_LOAD' } }),
      prisma.driver.update({ where: { id: driverId }, data: { status: 'ON_DUTY' } }),
    ]);

    // Mark matched suggestion as accepted
    await prisma.matchSuggestion.updateMany({
      where: { loadId: req.params.id, truckId, driverId },
      data:  { accepted: true },
    });

    await prisma.activityLog.create({
      data: { userId: req.user.id, action: 'ASSIGN', entity: 'LOAD', entityId: load.id, metadata: { truckId, driverId } },
    });

    const io = req.app.get('io');
    io?.emit('load:assigned', { loadId: load.id, truckId, driverId, dispatchedAt: load.dispatchedAt });

    res.json(load);
  } catch (err) { next(err); }
});

// PATCH /api/loads/:id/status — update load status (driver updates from app)
router.patch('/:id/status', authenticate, async (req, res, next) => {
  try {
    const { status, lat, lng, notes } = req.body;
    if (!status) return res.status(400).json({ message: 'status required' });

    const load = await prisma.load.update({
      where: { id: req.params.id },
      data: {
        status,
        ...(status === 'DELIVERED' && { actualDelivery: new Date() }),
        ...(status === 'AT_PICKUP' && { actualPickup: new Date() }),
      },
    });

    // Add tracking event
    if (lat && lng) {
      await prisma.loadTrackingEvent.create({
        data: { loadId: load.id, eventType: status, lat, lng, notes },
      });
      // Recalc ETA
      await recalcETA(load.id, lat, lng).catch(console.error);
    }

    const io = req.app.get('io');
    io?.to(`load_${load.id}`).emit('load:statusUpdate', { loadId: load.id, status, lat, lng });

    res.json(load);
  } catch (err) { next(err); }
});

// POST /api/loads/:id/matches — regenerate AI match suggestions
router.post('/:id/matches', authenticate, authorize(...DISPATCH_ROLES), async (req, res, next) => {
  try {
    const suggestions = await generateMatches(req.params.id);
    const io = req.app.get('io');
    io?.emit('match:suggested', { loadId: req.params.id, suggestions });
    res.json(suggestions);
  } catch (err) { next(err); }
});

// DELETE /api/loads/:id
router.delete('/:id', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    await prisma.load.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
    res.json({ message: 'Load cancelled' });
  } catch (err) { next(err); }
});

module.exports = router;
