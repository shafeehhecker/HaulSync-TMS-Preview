const express = require('express');
const prisma  = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/analytics/dashboard — live KPI snapshot
router.get('/dashboard', authenticate, async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [
      totalLoads, unassigned, inTransit, deliveredToday,
      trucksAvailable, trucksOnLoad,
      hosAlerts, hosViolations,
      avgBOLConfidence,
    ] = await Promise.all([
      prisma.load.count({ where: { status: { not: 'CANCELLED' } } }),
      prisma.load.count({ where: { status: 'UNASSIGNED' } }),
      prisma.load.count({ where: { status: { in: ['IN_TRANSIT', 'AT_PICKUP', 'AT_DELIVERY'] } } }),
      prisma.load.count({ where: { status: 'DELIVERED', actualDelivery: { gte: today } } }),
      prisma.truck.count({ where: { status: 'AVAILABLE', isActive: true } }),
      prisma.truck.count({ where: { status: 'ON_LOAD', isActive: true } }),
      prisma.hOSAlert.count({ where: { isRead: false, alertType: { not: 'VIOLATION_DETECTED' } } }),
      prisma.hOSAlert.count({ where: { isRead: false, alertType: 'VIOLATION_DETECTED' } }),
      prisma.document.aggregate({ where: { aiStatus: 'EXTRACTED' }, _avg: { aiConfidence: true } }),
    ]);

    const fleetUtil = trucksOnLoad + trucksAvailable > 0
      ? Math.round((trucksOnLoad / (trucksOnLoad + trucksAvailable)) * 100)
      : 0;

    res.json({
      loads: { total: totalLoads, unassigned, inTransit, deliveredToday },
      fleet: { available: trucksAvailable, onLoad: trucksOnLoad, utilization: fleetUtil },
      hos:   { alerts: hosAlerts, violations: hosViolations },
      ai:    { avgBOLConfidence: Math.round((avgBOLConfidence._avg.aiConfidence || 0) * 100) },
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/loads — time-series load volume
router.get('/loads', authenticate, async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - Number(days) * 24 * 3600 * 1000);

    const loads = await prisma.load.findMany({
      where:  { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      select: { createdAt: true, status: true, actualMiles: true, rate: true },
    });

    // Group by day
    const byDay = {};
    for (const l of loads) {
      const day = l.createdAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { date: day, count: 0, revenue: 0, miles: 0 };
      byDay[day].count++;
      byDay[day].revenue += l.rate || 0;
      byDay[day].miles   += l.actualMiles || 0;
    }

    res.json(Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)));
  } catch (err) { next(err); }
});

// GET /api/analytics/drivers — driver performance
router.get('/drivers', authenticate, async (req, res, next) => {
  try {
    const drivers = await prisma.driver.findMany({
      where:   { isActive: true },
      include: {
        loads:     { where: { status: 'COMPLETED' }, select: { id: true, actualMiles: true, rate: true } },
        hosAlerts: { where: { alertType: 'VIOLATION_DETECTED' }, select: { id: true } },
      },
      orderBy: { totalLoads: 'desc' },
      take: 20,
    });

    const result = drivers.map(d => ({
      id:         d.id,
      name:       d.name,
      hosRuleSet: d.hosRuleSet,
      status:     d.status,
      totalLoads: d.totalLoads,
      violations: d.hosAlerts.length,
      totalMiles: d.loads.reduce((s, l) => s + (l.actualMiles || 0), 0),
      totalRevenue: d.loads.reduce((s, l) => s + (l.rate || 0), 0),
      rating:     d.rating,
    }));

    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
