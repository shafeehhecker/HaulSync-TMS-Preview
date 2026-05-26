const express    = require('express');
const prisma     = require('../lib/prisma');
const { authenticate, authorize } = require('../middleware/auth');
const hosEngine  = require('../engines/hosEngine');
const eldAdapter = require('../lib/eldAdapter');

const router = express.Router();

// GET /api/hos/drivers — all drivers with live HOS state
router.get('/drivers', authenticate, async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = { isActive: true };
    if (status) where.status = status;

    const drivers = await prisma.driver.findMany({
      where,
      include: {
        loads: {
          where:   { status: { in: ['ASSIGNED', 'IN_TRANSIT', 'AT_PICKUP', 'AT_DELIVERY'] } },
          select:  { id: true, loadNumber: true, pickupCity: true, deliveryCity: true },
          take: 1,
        },
        hosAlerts: { where: { isRead: false }, orderBy: { createdAt: 'desc' }, take: 3 },
      },
      orderBy: { currentHosDriving: 'asc' }, // lowest HOS remaining first
    });

    res.json(drivers);
  } catch (err) { next(err); }
});

// GET /api/hos/alerts — all unread HOS alerts
router.get('/alerts', authenticate, async (req, res, next) => {
  try {
    const alerts = await prisma.hOSAlert.findMany({
      where:   { isRead: false },
      include: { driver: { select: { id: true, name: true } }, load: { select: { id: true, loadNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(alerts);
  } catch (err) { next(err); }
});

// POST /api/hos/drivers/:id/update — manual HOS update from driver
router.post('/drivers/:id/update', authenticate, async (req, res, next) => {
  try {
    const event = { ...req.body, driverId: req.params.id, source: 'MANUAL' };
    await hosEngine.applyELDEvent(req.params.id, event);
    res.json({ message: 'HOS updated' });
  } catch (err) { next(err); }
});

// POST /api/hos/eld/webhook — inbound webhook from ELD provider
router.post('/eld/webhook', async (req, res, next) => {
  try {
    const provider = req.query.provider || process.env.DEFAULT_ELD_PROVIDER || 'manual';
    const adapter  = eldAdapter.getAdapter(provider);
    const event    = adapter.normalise(req.body);

    if (!event.driverId) return res.status(400).json({ message: 'driverId required in normalised event' });

    await hosEngine.applyELDEvent(event.driverId, event);
    res.json({ received: true });
  } catch (err) { next(err); }
});

// PATCH /api/hos/alerts/:id/read — mark alert as read
router.patch('/alerts/:id/read', authenticate, async (req, res, next) => {
  try {
    await prisma.hOSAlert.update({ where: { id: req.params.id }, data: { isRead: true } });
    res.json({ message: 'Alert marked as read' });
  } catch (err) { next(err); }
});

// POST /api/hos/drivers/:id/evaluate — manually trigger HOS evaluation
router.post('/drivers/:id/evaluate', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'), async (req, res, next) => {
  try {
    const alerts = await hosEngine.evaluateDriver(req.params.id);
    res.json({ alerts });
  } catch (err) { next(err); }
});

module.exports = router;
