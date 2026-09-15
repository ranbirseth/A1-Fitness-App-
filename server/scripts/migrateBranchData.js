require("dotenv").config();
const mongoose = require("mongoose");
const { Branch } = require("../models/generic.model");
const User = require("../models/user.model");
const Member = require("../models/member.model");
const Plan = require("../models/plan.model");
const Payment = require("../models/payment.model");
const Attendance = require("../models/attendance.model");

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for branch data migration...");

    // 1. Ensure a default MAIN branch exists
    const mainBranch = await Branch.findOne({ branchCode: "MAIN" });
    if (!mainBranch) {
      await Branch.create({
        gymId: "MAIN",
        name: "Main Branch",
        branchCode: "MAIN",
        status: "active",
        description: "Primary Gym Branch"
      });
      console.log("Created default MAIN branch.");
    } else {
      console.log("Found existing MAIN branch:", mainBranch.name);
    }

    // 2. Users migration
    const userRes = await User.updateMany(
      { $or: [{ branchCode: { $exists: false } }, { branchCode: null }, { branchCode: "" }] },
      { $set: { branchCode: "MAIN" } }
    );
    console.log(`Updated ${userRes.modifiedCount} Users with default branchCode 'MAIN'.`);

    // 3. Members migration
    const memberRes = await Member.updateMany(
      { $or: [{ branchCode: { $exists: false } }, { branchCode: null }, { branchCode: "" }] },
      { $set: { branchCode: "MAIN" } }
    );
    console.log(`Updated ${memberRes.modifiedCount} Members with default branchCode 'MAIN'.`);

    // 4. Payments migration (derive from Member)
    const payments = await Payment.find({ $or: [{ branchCode: { $exists: false } }, { branchCode: null }] }).populate("member", "branchCode");
    let paymentCount = 0;
    for (const payment of payments) {
      const branchCode = payment.member?.branchCode || "MAIN";
      payment.branchCode = branchCode;
      await payment.save();
      paymentCount++;
    }
    console.log(`Updated ${paymentCount} Payments with linked branchCodes.`);

    // 5. Attendance migration (derive from Member)
    const attendances = await Attendance.find({ $or: [{ branchCode: { $exists: false } }, { branchCode: null }] }).populate("member", "branchCode");
    let attendanceCount = 0;
    for (const att of attendances) {
      const branchCode = att.member?.branchCode || "MAIN";
      att.branchCode = branchCode;
      await att.save();
      attendanceCount++;
    }
    console.log(`Updated ${attendanceCount} Attendance records with linked branchCodes.`);

    // 6. Plans migration (update index if needed)
    try {
      await Plan.collection.dropIndex("gymId_1_name_1");
      console.log("Dropped legacy plan unique index (gymId_1_name_1).");
    } catch (e) {
      // index might not exist or already dropped
    }
    await Plan.syncIndexes();
    console.log("Synced Plan indexes.");

    console.log("Migration complete!");
    await mongoose.disconnect();
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
}

migrate();
