require("dotenv").config();
const mongoose = require("mongoose");
const Member = require("../models/member.model");
const Payment = require("../models/payment.model");
const Plan = require("../models/plan.model");
require("../models/user.model"); // register User so Member.user can be populated

// One-time, idempotent backfill: for every member who is currently subscribed to
// a plan (member.currentPlan set) but has NO membership payment on record (no
// Payment row with the same member + plan + membershipStartDate), create exactly
// ONE Payment so the member's subscription has a matching revenue record.
//
// SAFETY: DRY RUN by default. Pass `--run` to actually write.
// - Never touches/deletes existing Payments.
// - Never mutates Members or Plans (dates/branch preserved from the member).
// - Uses a deterministic termKey from the member's own membershipStartDate, so
//   re-running the script can never create duplicates.
// - member.paymentStatus drives Payment.status, so paid vs pending is preserved.

const RUN = process.argv.includes("--run");

// Deterministic termKey mirroring member.controller.js resolvePaymentShape.
// Sparse-unique index on {gymId, termKey} makes re-runs idempotent.
const termKeyFor = (member, planId) =>
  member.membershipStartDate
    ? `${member._id}:${planId}:${new Date(member.membershipStartDate).toISOString()}`
    : `${member._id}:${planId}:<nostart>`;

const invoiceNumberFor = (member) =>
  `INV-${Date.now()}-${member._id.toString().slice(-6)}`;

async function backfill() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log("Connected to MongoDB:", mongoose.connection.name);
    console.log(RUN ? ">>> RUN MODE (will write)" : ">>> DRY RUN (read-only, no writes)");

    const members = await Member.find({ currentPlan: { $exists: true, $ne: null } })
      .populate("user", "name email");
    let scanned = 0, missing = 0, wouldCreate = 0, created = 0, skipped = 0, failed = 0;

    const memberLabel = (member) =>
      `${String(member._id).slice(0, 8)} ${(member.user?.name || member.user?.email || member._id).toString().padEnd(12)}`;

    for (const member of members) {
      scanned++;
      const planId = String(member.currentPlan);
      const start = member.membershipStartDate;

      let existing = null;
      if (start) {
        existing = await Payment.findOne({
          gymId: member.gymId,
          member: member._id,
          plan: member.currentPlan,
          membershipStartDate: start
        });
      }
      if (!existing) {
        existing = await Payment.findOne({
          gymId: member.gymId,
          member: member._id,
          plan: member.currentPlan,
          termKey: termKeyFor(member, planId)
        });
      }

      const branch = (member.branchCode || "MAIN").trim().toUpperCase();
      const hasMembershipDates = !!start && !!member.membershipExpiryDate;

      if (existing) {
        skipped++;
        console.log(`  SKIP ${memberLabel(member)} - payment already exists (${existing.invoiceNumber})`);
        continue;
      }

      missing++;

      // Without membership dates we cannot build a valid termKey/start snapshot;
      // low confidence -> skip (never fabricate dates).
      if (!hasMembershipDates) {
        skipped++;
        console.log(`  SKIP ${memberLabel(member)} - subscribed but missing membershipStartDate/ExpiryDate (can't fabricate)`);
        continue;
      }

      // Look up the referenced plan for a real price (never fabricate an amount).
      let plan = null;
      try {
        plan = await Plan.findOne({ _id: member.currentPlan, gymId: member.gymId }).select("name price duration");
      } catch (e) {
        plan = null;
      }
      const status = member.paymentStatus === "paid" ? "paid" : "pending";
      const amount = plan && typeof plan.price === "number" ? plan.price : 0;
      const planName = plan ? plan.name : "membership";
      const paymentData = {
        gymId: member.gymId,
        member: member._id,
        plan: member.currentPlan,
        amount,
        method: "cash",
        status,
        note: `Backfilled membership payment for subscribed member (${planName}).`,
        date: start,
        invoiceNumber: invoiceNumberFor(member),
        branchCode: branch,
        membershipStartDate: start,
        membershipExpiryDate: member.membershipExpiryDate,
        operationType: "assign",
        termKey: termKeyFor(member, planId),
        invoice: {
          invoiceNumber: invoiceNumberFor(member),
          amount,
          member: member._id,
          plan: member.currentPlan,
          branchCode: branch,
          createdAt: start.toISOString()
        }
      };

      wouldCreate++;
      console.log(
        `  ${RUN ? "CREATE" : "WOULD CREATE"} ${memberLabel(member)} ` +
        `plan=${planId.slice(0, 8)} status=${status} amt=${amount} start=${start.toISOString().slice(0, 10)}`
      );

      if (RUN) {
        try {
          await Payment.create(paymentData);
          created++;
        } catch (e) {
          // 11000 => a concurrent run already created it; that's a success, not an error.
          if (e.code === 11000) {
            created++;
            console.log(`    (duplicate suppressed - already backfilled)`);
          } else {
            failed++;
            console.error(`  FAILED ${member._id}: ${e.message}`);
          }
        }
      }
    }

    console.log("");
    console.log("Summary:");
    console.log("  scanned       :", scanned);
    console.log("  missing       :", missing);
    console.log("  wouldCreate   :", wouldCreate);
    console.log("  created       :", created);
    console.log("  skipped       :", skipped);
    console.log("  failed        :", failed);

    if (!RUN) {
      console.log("\nNo changes made (DRY RUN). Re-run with `node scripts/backfillMissingMembershipPayments.js --run` to apply.");
    }
    process.exit(0);
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exit(1);
  }
}

backfill();
