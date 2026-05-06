import { eq, sql as drizzleSql } from "drizzle-orm";
import { db, sql } from "./client";
import { bookingEvents, bookings, drivers, users } from "./schema";

/**
 * Seed script — populates the database with enough realistic-looking data
 * that the admin dashboard, history screens, and earnings views all look
 * full on first boot. Everything inserted here is flagged `is_demo: true`,
 * so once real users start signing up, the admin can filter demo rows out.
 */

const demoDrivers = [
  { phone: "+919999000001", name: "Ravi Kumar",    vehicleNumber: "DL-AMB-1001", lastLat: 28.6139, lastLng: 77.2090, status: "AVAILABLE" as const, rating: 4.9 },
  { phone: "+919999000002", name: "Suresh Patel",  vehicleNumber: "DL-AMB-1002", lastLat: 28.6220, lastLng: 77.2200, status: "AVAILABLE" as const, rating: 4.8 },
  { phone: "+919999000003", name: "Priya Singh",   vehicleNumber: "DL-AMB-1003", lastLat: 28.6050, lastLng: 77.2000, status: "ON_TRIP"   as const, rating: 5.0 },
  { phone: "+919999000004", name: "Amit Yadav",    vehicleNumber: "DL-AMB-1004", lastLat: 28.6320, lastLng: 77.2240, status: "AVAILABLE" as const, rating: 4.7 },
  { phone: "+919999000005", name: "Neha Sharma",   vehicleNumber: "DL-AMB-1005", lastLat: 28.5900, lastLng: 77.2100, status: "OFFLINE"   as const, rating: 4.6 }
];

const demoUsers = [
  { phone: "+919888100001", name: "Rohit Mehta",     bloodGroup: "B+"  },
  { phone: "+919888100002", name: "Anjali Reddy",    bloodGroup: "O+"  },
  { phone: "+919888100003", name: "Vikram Gupta",    bloodGroup: "A-"  },
  { phone: "+919888100004", name: "Meera Iyer",      bloodGroup: "AB+" },
  { phone: "+919888100005", name: "Arun Krishnan",   bloodGroup: "O-"  }
];

type EmergencyType =
  | "ACCIDENT_TRAUMA"
  | "CARDIAC"
  | "BREATHING_DISTRESS"
  | "PREGNANCY_NEONATAL"
  | "GENERAL_CRITICAL_TRANSFER";

type DemoBookingPlan = {
  status: "REQUESTED" | "ACCEPTED" | "ARRIVED" | "PICKED_UP" | "COMPLETED" | "CANCELLED" | "TIMED_OUT";
  emergencyType: EmergencyType;
  pickupAddress: string;
  dropAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  fareEstimate: number;
  minutesAgo: number;
  rating?: number;
  feedback?: string;
};

// 12 demo bookings spread across statuses + over the past few days.
const bookingPlans: DemoBookingPlan[] = [
  // Active/recent (today)
  { status: "REQUESTED",  emergencyType: "CARDIAC",                   pickupAddress: "Connaught Place",       dropAddress: "AIIMS",                     pickupLat: 28.6315, pickupLng: 77.2167, dropLat: 28.5672, dropLng: 77.2100, fareEstimate: 720, minutesAgo: 2 },
  { status: "REQUESTED",  emergencyType: "BREATHING_DISTRESS",        pickupAddress: "Karol Bagh",            dropAddress: "Sir Ganga Ram Hospital",    pickupLat: 28.6519, pickupLng: 77.1909, dropLat: 28.6379, dropLng: 77.1900, fareEstimate: 540, minutesAgo: 5 },
  { status: "ACCEPTED",   emergencyType: "ACCIDENT_TRAUMA",           pickupAddress: "ITO crossing",          dropAddress: "Lok Nayak Hospital",        pickupLat: 28.6310, pickupLng: 77.2410, dropLat: 28.6350, dropLng: 77.2410, fareEstimate: 530, minutesAgo: 8 },
  { status: "PICKED_UP",  emergencyType: "PREGNANCY_NEONATAL",        pickupAddress: "Greater Kailash",       dropAddress: "Apollo Hospital",           pickupLat: 28.5494, pickupLng: 77.2382, dropLat: 28.5300, dropLng: 77.2200, fareEstimate: 680, minutesAgo: 14 },

  // Today, completed
  { status: "COMPLETED",  emergencyType: "CARDIAC",                   pickupAddress: "Saket",                 dropAddress: "Max Saket",                 pickupLat: 28.5245, pickupLng: 77.2066, dropLat: 28.5278, dropLng: 77.2110, fareEstimate: 510, minutesAgo: 35,  rating: 5, feedback: "Driver was very calm and quick" },
  { status: "COMPLETED",  emergencyType: "ACCIDENT_TRAUMA",           pickupAddress: "Rohini Sector 7",       dropAddress: "Rajiv Gandhi Hospital",     pickupLat: 28.7041, pickupLng: 77.1025, dropLat: 28.6700, dropLng: 77.1100, fareEstimate: 760, minutesAgo: 110, rating: 4, feedback: "Could have arrived faster" },
  { status: "COMPLETED",  emergencyType: "BREATHING_DISTRESS",        pickupAddress: "Lajpat Nagar",          dropAddress: "Moolchand Medcity",         pickupLat: 28.5708, pickupLng: 77.2436, dropLat: 28.5680, dropLng: 77.2380, fareEstimate: 500, minutesAgo: 180, rating: 5, feedback: "Lifesaver" },

  // Yesterday/older
  { status: "COMPLETED",  emergencyType: "GENERAL_CRITICAL_TRANSFER", pickupAddress: "Dwarka Sector 21",      dropAddress: "BLK Super Speciality",      pickupLat: 28.5523, pickupLng: 77.0590, dropLat: 28.6450, dropLng: 77.1840, fareEstimate: 1280, minutesAgo: 60 * 26, rating: 5, feedback: "Smooth transfer between hospitals" },
  { status: "COMPLETED",  emergencyType: "CARDIAC",                   pickupAddress: "Pitampura",             dropAddress: "Fortis Shalimar Bagh",      pickupLat: 28.7041, pickupLng: 77.1330, dropLat: 28.7167, dropLng: 77.1660, fareEstimate: 620, minutesAgo: 60 * 30, rating: 4, feedback: "Good experience" },
  { status: "CANCELLED",  emergencyType: "ACCIDENT_TRAUMA",           pickupAddress: "Vasant Kunj",           dropAddress: "AIIMS",                     pickupLat: 28.5274, pickupLng: 77.1591, dropLat: 28.5672, dropLng: 77.2100, fareEstimate: 580, minutesAgo: 60 * 28 },
  { status: "TIMED_OUT",  emergencyType: "BREATHING_DISTRESS",        pickupAddress: "Mukherjee Nagar",       dropAddress: "Hindu Rao Hospital",        pickupLat: 28.7061, pickupLng: 77.2092, dropLat: 28.6720, dropLng: 77.2100, fareEstimate: 550, minutesAgo: 60 * 50 },
  { status: "COMPLETED",  emergencyType: "PREGNANCY_NEONATAL",        pickupAddress: "Mayur Vihar Phase 1",   dropAddress: "Yashoda Hospital",          pickupLat: 28.6080, pickupLng: 77.3050, dropLat: 28.6450, dropLng: 77.3050, fareEstimate: 600, minutesAgo: 60 * 70, rating: 5, feedback: "Perfect handling" }
];

async function clearDemoRows() {
  // Delete only is_demo rows, keep real-traffic rows untouched.
  await db.delete(bookingEvents).where(drizzleSql`booking_id IN (SELECT id FROM bookings WHERE is_demo = true)`);
  await db.delete(bookings).where(eq(bookings.isDemo, true));
  await db.delete(drivers).where(eq(drivers.isDemo, true));
  await db.delete(users).where(eq(users.isDemo, true));
}

async function main() {
  console.log("[seed] clearing previous demo rows...");
  await clearDemoRows();

  console.log("[seed] inserting demo drivers...");
  const driverIds: Record<string, string> = {};
  for (const d of demoDrivers) {
    const [row] = await db
      .insert(drivers)
      .values({
        phone: d.phone,
        name: d.name,
        vehicleNumber: d.vehicleNumber,
        vehicleType: "BLS",
        status: d.status,
        kycVerified: true,
        rating: d.rating,
        lastLat: d.lastLat,
        lastLng: d.lastLng,
        lastSeenAt: new Date(),
        isDemo: true
      })
      .returning({ id: drivers.id });
    driverIds[d.phone] = row.id;
  }

  console.log("[seed] inserting demo users...");
  const userIds: Record<string, string> = {};
  for (const u of demoUsers) {
    const [row] = await db
      .insert(users)
      .values({ phone: u.phone, name: u.name, bloodGroup: u.bloodGroup, isDemo: true })
      .returning({ id: users.id });
    userIds[u.phone] = row.id;
  }

  console.log("[seed] inserting demo bookings...");
  const userIdList = Object.values(userIds);
  const driverIdList = Object.values(driverIds);
  const now = Date.now();

  for (let i = 0; i < bookingPlans.length; i++) {
    const p = bookingPlans[i];
    const userId = userIdList[i % userIdList.length];
    const driverId = ["REQUESTED"].includes(p.status)
      ? null
      : driverIdList[i % driverIdList.length];

    const created = new Date(now - p.minutesAgo * 60 * 1000);
    const accepted = ["ACCEPTED", "ARRIVED", "PICKED_UP", "COMPLETED"].includes(p.status)
      ? new Date(created.getTime() + 60_000)
      : null;
    const arrived = ["ARRIVED", "PICKED_UP", "COMPLETED"].includes(p.status)
      ? new Date(created.getTime() + 8 * 60_000)
      : null;
    const pickedUp = ["PICKED_UP", "COMPLETED"].includes(p.status)
      ? new Date(created.getTime() + 11 * 60_000)
      : null;
    const completed = p.status === "COMPLETED" ? new Date(created.getTime() + 25 * 60_000) : null;
    const cancelled = p.status === "CANCELLED" ? new Date(created.getTime() + 4 * 60_000) : null;

    const [b] = await db
      .insert(bookings)
      .values({
        userId,
        driverId,
        emergencyType: p.emergencyType,
        status: p.status,
        pickupLat: p.pickupLat,
        pickupLng: p.pickupLng,
        pickupAddress: p.pickupAddress,
        dropLat: p.dropLat,
        dropLng: p.dropLng,
        dropAddress: p.dropAddress,
        fareEstimateInr: p.fareEstimate,
        fareFinalInr: p.status === "COMPLETED" ? p.fareEstimate : null,
        rating: p.rating ?? null,
        feedback: p.feedback ?? null,
        isDemo: true,
        createdAt: created,
        acceptedAt: accepted,
        arrivedAt: arrived,
        pickedUpAt: pickedUp,
        completedAt: completed,
        cancelledAt: cancelled
      })
      .returning({ id: bookings.id });

    // Audit-trail events for the timeline.
    const events = [
      { ts: created, type: "booking.created", actor: `user:${userId}` }
    ];
    if (accepted) events.push({ ts: accepted, type: "booking.accepted", actor: `driver:${driverId ?? ""}` });
    if (arrived)  events.push({ ts: arrived,  type: "booking.arrived",  actor: `driver:${driverId ?? ""}` });
    if (pickedUp) events.push({ ts: pickedUp, type: "booking.picked_up", actor: `driver:${driverId ?? ""}` });
    if (completed) events.push({ ts: completed, type: "booking.completed", actor: `driver:${driverId ?? ""}` });
    if (cancelled) events.push({ ts: cancelled, type: "booking.cancelled", actor: `user:${userId}` });

    for (const ev of events) {
      await db.insert(bookingEvents).values({
        bookingId: b.id,
        actor: ev.actor,
        type: ev.type,
        payloadJson: null,
        createdAt: ev.ts
      });
    }
  }

  console.log("[seed] done.");
  console.log(`[seed] ${demoDrivers.length} drivers · ${demoUsers.length} users · ${bookingPlans.length} bookings · all flagged is_demo=true`);
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
