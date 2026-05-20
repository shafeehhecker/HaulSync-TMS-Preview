const { PrismaClient } = require('@prisma/client');
const bcrypt           = require('bcryptjs');
const prisma           = new PrismaClient();

async function main() {
  console.log('🌱 Seeding HaulSync TMS Dispatch database…');
  const hash = (pw) => bcrypt.hash(pw, 10);

  // ── Carrier ──────────────────────────────────────────────────────────────
  const carrier = await prisma.carrier.upsert({
    where:  { id: 'tms-carrier-001' },
    update: {},
    create: { id: 'tms-carrier-001', name: 'HaulSync Demo Carrier LLC', mcNumber: 'MC-987654', dotNumber: 'DOT-123456', city: 'Chicago', state: 'IL', country: 'US', phone: '3125550100', email: 'ops@haulsynccarrier.com' },
  });

  // ── Shippers ─────────────────────────────────────────────────────────────
  const [sh1, sh2] = await Promise.all([
    prisma.shipper.upsert({ where: { id: 'tms-shipper-001' }, update: {}, create: { id: 'tms-shipper-001', name: 'Midwest Distribution Co.', city: 'Chicago', state: 'IL', phone: '3125550200', email: 'logistics@midwestdist.com' } }),
    prisma.shipper.upsert({ where: { id: 'tms-shipper-002' }, update: {}, create: { id: 'tms-shipper-002', name: 'Gulf Coast Freight Inc.', city: 'Houston', state: 'TX', phone: '7135550300', email: 'ops@gulfcoastfreight.com' } }),
  ]);

  // ── Users ─────────────────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: 'admin@haulsync.local' }, update: {},
    create: { name: 'Super Admin', email: 'admin@haulsync.local', password: await hash('Admin@1234'), role: 'SUPER_ADMIN', carrierId: carrier.id },
  });
  await prisma.user.upsert({ where: { email: 'dispatcher@haulsync.local' }, update: {}, create: { name: 'Lead Dispatcher', email: 'dispatcher@haulsync.local', password: await hash('Dispatch@1234'), role: 'DISPATCHER', carrierId: carrier.id } });
  await prisma.user.upsert({ where: { email: 'operator@haulsync.local' }, update: {}, create: { name: 'Ops Operator', email: 'operator@haulsync.local', password: await hash('Ops@1234'), role: 'OPERATOR', carrierId: carrier.id } });
  await prisma.user.upsert({ where: { email: 'finance@haulsync.local' }, update: {}, create: { name: 'Finance Mgr', email: 'finance@haulsync.local', password: await hash('Finance@1234'), role: 'FINANCE', carrierId: carrier.id } });

  // ── Trucks ────────────────────────────────────────────────────────────────
  const [t1, t2, t3, t4, t5] = await Promise.all([
    prisma.truck.upsert({ where: { unitNumber: 'T-099' }, update: {}, create: { unitNumber: 'T-099', type: 'DRY_VAN', make: 'Freightliner', model: 'Cascadia', year: 2022, licensePlate: 'IL-9938X', state: 'IL', eldProvider: 'SAMSARA', currentLat: 41.878, currentLng: -87.629, currentLocation: 'Chicago, IL', status: 'AVAILABLE', carrierId: carrier.id } }),
    prisma.truck.upsert({ where: { unitNumber: 'T-108' }, update: {}, create: { unitNumber: 'T-108', type: 'REEFER', make: 'Kenworth', model: 'T680', year: 2021, licensePlate: 'IL-1082Y', state: 'IL', eldProvider: 'MOTIVE', currentLat: 41.499, currentLng: -81.694, currentLocation: 'Cleveland, OH', status: 'ON_LOAD', carrierId: carrier.id } }),
    prisma.truck.upsert({ where: { unitNumber: 'T-114' }, update: {}, create: { unitNumber: 'T-114', type: 'DRY_VAN', make: 'Peterbilt', model: '579', year: 2023, licensePlate: 'TX-4421Z', state: 'TX', eldProvider: 'SAMSARA', currentLat: 32.776, currentLng: -96.796, currentLocation: 'Dallas, TX', status: 'AVAILABLE', carrierId: carrier.id } }),
    prisma.truck.upsert({ where: { unitNumber: 'T-067' }, update: {}, create: { unitNumber: 'T-067', type: 'FLATBED', make: 'Mack', model: 'Anthem', year: 2020, licensePlate: 'TN-7712A', state: 'TN', eldProvider: 'GEOTAB', currentLat: 35.148, currentLng: -90.048, currentLocation: 'Memphis, TN', status: 'AVAILABLE', carrierId: carrier.id } }),
    prisma.truck.upsert({ where: { unitNumber: 'T-142' }, update: {}, create: { unitNumber: 'T-142', type: 'DRY_VAN', make: 'International', model: 'LT', year: 2022, licensePlate: 'GA-9951B', state: 'GA', eldProvider: 'MOTIVE', currentLat: 33.749, currentLng: -84.388, currentLocation: 'Atlanta, GA', status: 'ON_LOAD', carrierId: carrier.id } }),
  ]);

  // ── Drivers ───────────────────────────────────────────────────────────────
  const [d1, d2, d3, d4, d5] = await Promise.all([
    prisma.driver.upsert({ where: { phone: '3125550001' }, update: {}, create: { name: 'James Rodriguez', phone: '3125550001', licenseNumber: 'IL-D1234567', licenseState: 'IL', hosRuleSet: 'US_PROPERTY', currentHosDriving: 9.2, currentHosOnDuty: 11.5, currentHosWeekly: 54.0, status: 'AVAILABLE', rating: 4.9, totalLoads: 312, carrierId: carrier.id } }),
    prisma.driver.upsert({ where: { phone: '2165550002' }, update: {}, create: { name: 'Sara Kim', phone: '2165550002', licenseNumber: 'OH-D7654321', licenseState: 'OH', hosRuleSet: 'US_PROPERTY', currentHosDriving: 2.1, currentHosOnDuty: 3.5, currentHosWeekly: 62.0, status: 'ON_DUTY', rating: 4.6, totalLoads: 198, carrierId: carrier.id } }),
    prisma.driver.upsert({ where: { phone: '2145550003' }, update: {}, create: { name: 'Mike Patel', phone: '2145550003', licenseNumber: 'TX-D9988776', licenseState: 'TX', hosRuleSet: 'US_PROPERTY', currentHosDriving: 4.5, currentHosOnDuty: 6.0, currentHosWeekly: 48.0, status: 'AVAILABLE', rating: 4.7, totalLoads: 227, carrierId: carrier.id } }),
    prisma.driver.upsert({ where: { phone: '9015550004' }, update: {}, create: { name: 'Ray Davis', phone: '9015550004', licenseNumber: 'TN-D4455667', licenseState: 'TN', hosRuleSet: 'US_PROPERTY', currentHosDriving: 6.1, currentHosOnDuty: 8.0, currentHosWeekly: 40.0, status: 'AVAILABLE', rating: 4.4, totalLoads: 155, carrierId: carrier.id } }),
    prisma.driver.upsert({ where: { phone: '4045550005' }, update: {}, create: { name: 'Alicia Chen', phone: '4045550005', licenseNumber: 'GA-D2233445', licenseState: 'GA', hosRuleSet: 'US_PROPERTY', currentHosDriving: 7.8, currentHosOnDuty: 10.0, currentHosWeekly: 35.0, status: 'ON_DUTY', rating: 4.8, totalLoads: 289, carrierId: carrier.id } }),
  ]);

  // ── Loads ─────────────────────────────────────────────────────────────────
  const [l1, l2, l3, l4, l5] = await Promise.all([
    prisma.load.upsert({ where: { loadNumber: 'LD-DEMO-001' }, update: {}, create: { loadNumber: 'LD-DEMO-001', bolRef: 'BOL-20240509-044', shipperId: sh1.id, carrierId: carrier.id, pickupAddress: '2200 S Halsted St', pickupCity: 'Chicago', pickupState: 'IL', pickupZip: '60608', pickupLat: 41.850, pickupLng: -87.646, deliveryAddress: '1 CNN Center', deliveryCity: 'Atlanta', deliveryState: 'GA', deliveryZip: '30303', deliveryLat: 33.749, deliveryLng: -84.388, commodity: 'Packaged goods', weightLbs: 42000, pieces: 24, pallets: 26, rate: 4200, estimatedMiles: 718, status: 'UNASSIGNED', slaDeadline: new Date(Date.now() + 28 * 3600 * 1000), createdById: admin.id } }),
    prisma.load.upsert({ where: { loadNumber: 'LD-DEMO-002' }, update: {}, create: { loadNumber: 'LD-DEMO-002', bolRef: 'BOL-20240509-043', shipperId: sh2.id, carrierId: carrier.id, pickupAddress: '5000 W Alabama St', pickupCity: 'Houston', pickupState: 'TX', pickupZip: '77056', pickupLat: 29.750, pickupLng: -95.492, deliveryAddress: '4747 E Elliot Rd', deliveryCity: 'Phoenix', deliveryState: 'AZ', deliveryZip: '85044', deliveryLat: 33.336, deliveryLng: -111.981, commodity: 'Frozen food', weightLbs: 38200, pieces: 18, pallets: 20, rate: 5800, estimatedMiles: 1176, status: 'UNASSIGNED', slaDeadline: new Date(Date.now() + 20 * 3600 * 1000), createdById: admin.id } }),
    prisma.load.upsert({ where: { loadNumber: 'LD-DEMO-003' }, update: {}, create: { loadNumber: 'LD-DEMO-003', bolRef: 'BOL-20240509-039', shipperId: sh1.id, carrierId: carrier.id, pickupAddress: '1 FedEx Way', pickupCity: 'Memphis', pickupState: 'TN', pickupZip: '38116', pickupLat: 35.052, pickupLng: -90.026, deliveryAddress: '1 Port Blvd', deliveryCity: 'Miami', deliveryState: 'FL', deliveryZip: '33132', deliveryLat: 25.774, deliveryLng: -80.184, commodity: 'Machinery', weightLbs: 44000, pieces: 6, pallets: 8, rate: 6100, estimatedMiles: 1092, status: 'ASSIGNED', truckId: t1.id, driverId: d1.id, dispatchedAt: new Date(Date.now() - 2 * 3600 * 1000), matchScore: 94, createdById: admin.id } }),
    prisma.load.upsert({ where: { loadNumber: 'LD-DEMO-004' }, update: {}, create: { loadNumber: 'LD-DEMO-004', bolRef: 'BOL-20240509-031', shipperId: sh2.id, carrierId: carrier.id, pickupAddress: '777 S Figueroa St', pickupCity: 'Los Angeles', pickupState: 'CA', pickupZip: '90017', pickupLat: 34.047, pickupLng: -118.257, deliveryAddress: '1301 2nd Ave', deliveryCity: 'Seattle', deliveryState: 'WA', deliveryZip: '98101', deliveryLat: 47.608, deliveryLng: -122.340, commodity: 'Electronics', weightLbs: 28000, pieces: 200, pallets: 14, rate: 7200, estimatedMiles: 1137, status: 'IN_TRANSIT', truckId: t5.id, driverId: d5.id, eta: new Date(Date.now() + 5 * 3600 * 1000), actualPickup: new Date(Date.now() - 8 * 3600 * 1000), createdById: admin.id } }),
    prisma.load.upsert({ where: { loadNumber: 'LD-DEMO-005' }, update: {}, create: { loadNumber: 'LD-DEMO-005', bolRef: 'BOL-20240509-028', shipperId: sh2.id, carrierId: carrier.id, pickupAddress: '8400 Mosley Rd', pickupCity: 'Houston', pickupState: 'TX', pickupZip: '77075', pickupLat: 29.627, pickupLng: -95.281, deliveryAddress: '1000 Chopper Circle', deliveryCity: 'Denver', deliveryState: 'CO', deliveryZip: '80204', deliveryLat: 39.748, deliveryLng: -105.007, commodity: 'Auto parts', weightLbs: 36000, pieces: 44, pallets: 22, rate: 4800, estimatedMiles: 1019, status: 'IN_TRANSIT', truckId: t2.id, driverId: d2.id, eta: new Date(Date.now() + 3 * 3600 * 1000 + 42 * 60 * 1000), createdById: admin.id } }),
  ]);

  // ── HOS Alerts ────────────────────────────────────────────────────────────
  await Promise.all([
    prisma.hOSAlert.upsert({ where: { id: 'hos-alert-001' }, update: {}, create: { id: 'hos-alert-001', driverId: d2.id, loadId: l5.id, alertType: 'HOS_WARNING', minutesRemaining: 126, message: 'Driver within 2h 6min of daily driving limit (11h rule)' } }),
    prisma.hOSAlert.upsert({ where: { id: 'hos-alert-002' }, update: {}, create: { id: 'hos-alert-002', driverId: d3.id, alertType: 'WEEKLY_LIMIT_WARNING', minutesRemaining: 2880, message: 'Driver within 48h of weekly limit (70h/8-day cap)' } }),
  ]);

  // ── Match Suggestions for LD-DEMO-001 ────────────────────────────────────
  await Promise.all([
    prisma.matchSuggestion.upsert({ where: { id: 'match-001' }, update: {}, create: { id: 'match-001', loadId: l1.id, truckId: t1.id, driverId: d1.id, rank: 1, totalScore: 96, distanceMiles: 42, scoreFactors: { distance: { score: 98, value: 42, label: '42 mi away' }, hos: { score: 100, value: 9.2, label: '9.2 hrs HOS' }, equipment: { score: 100, value: 'DRY_VAN', label: 'Dry Van' }, backhaul: { score: 0, value: 0, label: 'No backhaul' } } } }),
    prisma.matchSuggestion.upsert({ where: { id: 'match-002' }, update: {}, create: { id: 'match-002', loadId: l1.id, truckId: t3.id, driverId: d3.id, rank: 2, totalScore: 82, distanceMiles: 78, backhaulRevenue: 820, scoreFactors: { distance: { score: 74, value: 78, label: '78 mi away' }, hos: { score: 100, value: 11.0, label: '11.0 hrs HOS' }, equipment: { score: 100, value: 'DRY_VAN', label: 'Dry Van' }, backhaul: { score: 41, value: 820, label: 'Backhaul +$820' } } } }),
    prisma.matchSuggestion.upsert({ where: { id: 'match-003' }, update: {}, create: { id: 'match-003', loadId: l1.id, truckId: t4.id, driverId: d4.id, rank: 3, totalScore: 71, distanceMiles: 112, scoreFactors: { distance: { score: 63, value: 112, label: '112 mi away' }, hos: { score: 83, value: 6.1, label: '6.1 hrs HOS' }, equipment: { score: 100, value: 'FLATBED', label: 'Flatbed' }, backhaul: { score: 0, value: 0, label: 'No backhaul' } } } }),
  ]);

  console.log('\n✅ Seed complete!');
  console.log('   admin@haulsync.local        / Admin@1234       (SUPER_ADMIN)');
  console.log('   dispatcher@haulsync.local   / Dispatch@1234    (DISPATCHER)');
  console.log('   operator@haulsync.local     / Ops@1234         (OPERATOR)');
  console.log('   finance@haulsync.local      / Finance@1234     (FINANCE)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
