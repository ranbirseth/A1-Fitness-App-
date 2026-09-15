require("dotenv").config();
const mongoose = require("mongoose");
const Payment = require("../models/payment.model");
const Plan = require("../models/plan.model");

// Authoritative membership-expiry calculation — MUST mirror member.controller.js
// `calculateExpiry`. Uses server-local calendar-date semantics (no UTC shift):
//   const expiry = new Date(startDate); expiry.setDate(expiry.getDate() + durationDays);
const calculateExpiry = (startDate, durationDays) => {
  const expiry = new Date(startDate);
  expiry.setDate(expiry.getDate() + parseInt(durationDays, 10));
  return expiry;
};

const RUN = process.argv.includes("--run");

async function backfill() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log("Connected to MongoDB:", mongoose.connection.name);
    console.log(RUN ? ">>> RUN MODE (will write)" : ">>> PREVIEW MODE (read-only, no writes)");

    // Scoped, tenant-safe: every payment is processed against its OWN plan/date.
    // No cross-gym/branch writes, no Member/Plan mutation, no deletion.
    const payments = await Payment.find()
      .populate("plan", "name duration")
      .sort({ createdAt: 1 });

    let scanned = 0, eligible = 0, backfilled = 0, skipped = 0, failed = 0;
    const rows = [];

    for (const payment of payments) {
      scanned++;
      const existing = payment.membershipExpiryDate;
      // `payment.plan` is populated when the referenced plan still exists (name/duration
      // available); otherwise it is null (deleted/invalid ref) -> low confidence.
      const plan = payment.plan && payment.plan.duration !== undefined ? payment.plan : null;
      const duration = plan && plan.duration;
      const hasDate = !!payment.date;

      // Confidence: HIGH only when the referenced plan actually exists with a valid
      // positive integer duration AND the payment has a transaction date.
      const confident =
        !!plan &&
        Number.isInteger(duration) &&
        duration > 0 &&
        hasDate;

      const alreadyFilled = !!existing;
      let calc = null;
      let action = alreadyFilled ? "SKIP (snapshot exists)" : "SKIP (low confidence)";
      if (confident && !alreadyFilled) {
        calc = calculateExpiry(payment.date, plan.duration);
        action = RUN ? "BACKFILL" : "WOULD BACKFILL";
        eligible++;
      }

      const branch = payment.branchCode || (payment.member && payment.member.branchCode) || "?";
      rows.push({
        id: payment._id.toString(),
        planName: plan ? plan.name : (payment.plan ? "[deleted ref]" : "null"),
        duration: plan ? plan.duration : null,
        date: payment.date ? payment.date.toISOString().slice(0, 10) : null,
        existing: existing ? existing.toISOString().slice(0, 10) : null,
        calc: calc ? calc.toISOString().slice(0, 10) : null,
        branch,
        action
      });

      if (action === "SKIP (snapshot exists)") {
        skipped++;
      } else if (action === "SKIP (low confidence)") {
        skipped++;
      } else if (RUN) {
        try {
          payment.membershipExpiryDate = calc;
          await payment.save();
          backfilled++;
        } catch (e) {
          failed++;
          console.error("  FAILED payment", payment._id, e.message);
        }
      }
    }

    console.log("");
    console.log("Summary:");
    console.log("  scanned   :", scanned);
    console.log("  eligible  :", eligible);
    console.log("  backfilled:", backfilled);
    console.log("  skipped   :", skipped);
    console.log("  failed    :", failed);
    console.log("");

    console.log("Detail (" + (RUN ? "after run" : "preview") + "):");
    for (const r of rows) {
      console.log(
        [r.id.slice(0, 8), (r.planName || "").padEnd(16), ("d=" + (r.duration ?? "?")).padEnd(6),
         "date=" + r.date, "snap=" + r.existing, "=>calc=" + r.calc, "br=" + r.branch, r.action].join(" | ")
      );
    }

    if (!RUN) {
      console.log("\nNo changes made (preview). Re-run with `node scripts/backfillPaymentMembershipExpiry.js --run` to apply.");
    }
    process.exit(0);
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exit(1);
  }
}

backfill();
