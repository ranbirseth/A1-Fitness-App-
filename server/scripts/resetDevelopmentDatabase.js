require("dotenv").config();
const mongoose = require("mongoose");

// ============================================================
// DEVELOPMENT/TEST DATABASE RESET (A1 FITNESS)
// ============================================================
// Destructive reset for the LOCAL DEV/TEST MongoDB only.
//   - Refuses to run in production / against prod-looking DB names.
//   - Without `--confirm-reset` it ONLY prints a read-only snapshot + plan.
//   - Clears every application collection (deleteMany, indexes preserved).
//   - Recreates ONLY the configured dev Super Admin via the application's own
//     seed logic (ensureDevSuperadmin -> User.create -> bcrypt pre-save hash).
//   - Prints an explicit "DEVELOPMENT DATABASE RESET CONFIRMED" gate line.
// ============================================================

const CONFIRM_FLAG = "--confirm-reset";
const RUN = process.argv.includes(CONFIRM_FLAG);

const { ensureDevSuperadmin } = require("../seeds/seedLogic");

// Dev/test database names this script is allowed to reset. Anything production-like
// ("prod", "live", "main-*", the Vercel/Render hosted DB) is refused.
const SAFE_DB_NAMES = new Set([
  "test",
  "gymza",
  "gymza_test",
  "gymza_dev",
  "development",
  "dev",
  "a1",
  "a1_fitness",
  "a1fitness"
]);

const PROD_NODE_ENV = String(process.env.NODE_ENV || "").trim().toUpperCase() === "PRODUCTION";
const RENDER_HOSTED = Boolean(process.env.RENDER);

const isSafeDbName = (name) => SAFE_DB_NAMES.has(name) && !/prod/i.test(name);

const redactedUri = (uri) => {
  try {
    // mongodb+srv://user:pass@host -> mongodb+srv://***:***@host (credentials masked)
    return uri.replace(/^(mongodb\+srv|mongodb):\/\/[^@/]+@/, "$1://***:***@");
  } catch {
    return "<redacted>";
  }
};

const listCollections = async () => {
  const db = mongoose.connection.db;
  const cols = await db.listCollections().toArray();
  const out = [];
  for (const col of cols) {
    if (col.name.startsWith("system.")) continue;
    const count = await db.collection(col.name).countDocuments();
    out.push({ name: col.name, count });
  }
  return out;
};

const printCollectionTable = (rows) => {
  if (!rows.length) {
    console.log("  (no application collections found)");
    return;
  }
  const pad = Math.max(...rows.map((r) => r.name.length), 4);
  for (const row of rows) {
    console.log(`  ${row.name.padEnd(pad)}  ${row.count}`);
  }
};

const printUserRoleBreakdown = async () => {
  const db = mongoose.connection.db;
  const users = db.collection("users");
  try {
    const roles = await users.aggregate([
      { $group: { _id: "$role", n: { $sum: 1 } } }
    ]).toArray();
    const bucket = { superadmin: 0, admin: 0, trainer: 0, member: 0 };
    for (const r of roles) if (bucket[r._id] !== undefined) bucket[r._id] = r.n;
    console.log("  User roles         :", JSON.stringify(bucket));
  } catch {
    console.log("  User roles         : (users collection missing)");
  }
};

const printSuperadminStatus = async () => {
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const superadmins = await users
    .find({ role: "superadmin" }, { projection: { email: 1, status: 1, branchCode: 1, gymId: 1 } })
    .toArray();
  if (!superadmins.length) {
    console.log("  Current superadmin : NONE");
  } else {
    for (const sa of superadmins) {
      // Email/status/branch only - never print password.
      console.log(`  Current superadmin : ${sa.email} (status=${sa.status}, gymId=${sa.gymId}, branch=${sa.branchCode || "MAIN"})`);
    }
  }
  const requested = await users.findOne(
    { email: "superadmin@dev.local", role: "superadmin" },
    { projection: { email: 1, status: 1, branchCode: 1 } }
  );
  console.log(
    `  Requested SA exists: ${requested ? `YES (status=${requested.status})` : "NO"}`
  );
};

const clearAllApplicationCollections = async () => {
  const cols = await listCollections();
  for (const col of cols) {
    await mongoose.connection.db.collection(col.name).deleteMany({});
    console.log(`  cleared ${col.name}`);
  }
  return cols;
};

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL || "mongodb://127.0.0.1:27017/gymza";

  const snapshot = {
    dbName: null,
    env: process.env.NODE_ENV || "development",
    render: RENDER_HOSTED,
    collectionsSafe: null,
    productionBlocked: false
  };

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  } catch (error) {
    console.error("Reset aborted: could not connect to MongoDB.");
    console.error("  ", error.message);
    process.exit(1);
  }

  snapshot.dbName = mongoose.connection.name;

  console.log("===============================================");
  console.log("A1 FITNESS - DEVELOPMENT DATABASE RESET UTILITY");
  console.log("===============================================");
  console.log("");
  console.log("Database name      :", snapshot.dbName);
  console.log("NODE_ENV           :", snapshot.env);
  console.log("RENDER             :", snapshot.render ? "yes (hosted — BLOCKED)" : "no (localhost dev)");
  console.log("Connected URI      :", redactedUri(uri));
  console.log("");

  // ---- SAFETY GATE 1: environment must be dev/test --------------------
  if (PROD_NODE_ENV || RENDER_HOSTED) {
    snapshot.productionBlocked = true;
    console.error("SAFETY BLOCK: NODE_ENV=production or RENDER is set. Refusing to reset.");
    console.error("This utility is for the LOCAL DEVELOPMENT / TEST database only.");
    process.exit(1);
  }

  // ---- SAFETY GATE 2: database name must be a known dev/test name -------
  if (!isSafeDbName(snapshot.dbName)) {
    snapshot.productionBlocked = true;
    console.error(
      `SAFETY BLOCK: database '${snapshot.dbName}' is not in the permitted dev/test list. Refusing to reset.`
    );
    console.error("Permitted names:", [...SAFE_DB_NAMES].join(", "));
    process.exit(1);
  }

  console.log("Environment verified: development/test.");
  console.log("");

  // ---- READ-ONLY SNAPSHOT (always performed) ---------------------------
  console.log("--- PRE-RESET COLLECTION SNAPSHOT (read-only) ---");
  const cols = await listCollections();
  printCollectionTable(cols);
  console.log("");
  await printUserRoleBreakdown();
  await printSuperadminStatus();
  console.log("");
  console.log("Collections affected by a reset: all collections listed above.");
  console.log("Collections preserved: none (system collections are skipped).");
  console.log("Indexes: preserved (deletion is document-level only).");
  console.log("Bootstrap records recreated: 1 x Super Admin (dev.local) only.");
  console.log("");

  if (!RUN) {
    console.log("RESET NOT EXECUTED — read-only preview.");
    console.log(`Re-run with the explicit confirmation flag:\n  node scripts/resetDevelopmentDatabase.js ${CONFIRM_FLAG}`);
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
    return;
  }

  // ---- CONFIRMATION GATE --------------------------------------------------
  console.log("****************************************************");
  console.log("*  DEVELOPMENT DATABASE RESET CONFIRMED             *");
  console.log("*  Target: dev/test database '" + snapshot.dbName + "'");
  console.log("****************************************************");
  console.log("");

  // ---- CLEAR ALL APPLICATION DATA (indexes preserved) ---------------------
  console.log("--- CLEARING APPLICATION COLLECTIONS ---");
  const cleared = await clearAllApplicationCollections();
  console.log(`Cleared ${cleared.length} collection(s). All application data removed.`);
  console.log("");

  // ---- RECREATE THE DEV SUPER ADMIN VIA APP SEED/AUTH LOGIC ----------------
  console.log("--- RECREATING DEV SUPER ADMIN (application seed logic) ---");
  const superadminCount = await mongoose.model("User").countDocuments();
  if (superadminCount !== 0) {
    console.error("SAFETY CHECK FAILED: users are not empty after clearing. Aborting Super Admin creation.");
    process.exit(1);
  }
  await ensureDevSuperadmin();

  // ---- VERIFY HASHED PASSWORD + ROLE ---------------------------------------
  const db = mongoose.connection.db;
  const User = mongoose.model("User");
  const sa = await User.findOne({ email: "superadmin@dev.local", role: "superadmin" }).select("+password");
  if (!sa) {
    console.error("FAILED: Super Admin was not created.");
    process.exit(1);
  }
  const bcrypt = require("bcryptjs");
  const looksHashed = typeof sa.password === "string" && /^\$2[abxy]\$/.test(sa.password);
  console.log(`  Super Admin role        : ${sa.role}`);
  console.log(`  Super Admin gymId       : ${sa.gymId}`);
  console.log(`  Super Admin branch      : ${sa.branchCode || "MAIN"}`);
  console.log(`  Super Admin status      : ${sa.status}`);
  console.log(`  Password properly hashed: ${looksHashed ? "YES" : "NO (FAIL)"}`);
  if (!looksHashed) {
    console.error("FAILED: password not hashed. Aborting.");
    process.exit(1);
  }
  console.log("");

  // ---- FINAL CLEAN-STATE COUNTS -------------------------------------------
  console.log("--- POST-RESET CLEAN-STATE COUNTS ---");
  const after = await listCollections();
  printCollectionTable(after);
  console.log("");
  const totalUsers = await db.collection("users").countDocuments();
  const roles = await db.collection("users").aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]).toArray();
  console.log(`Total users after reset : ${totalUsers}`);
  console.log("User roles after reset  :", JSON.stringify(Object.fromEntries(roles.map((r) => [r._id, r.n]))));
  console.log("");
  console.log("Reset complete. Backend may be used for a clean end-to-end test.");
  if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  process.exit(0);
};

run().catch((error) => {
  console.error("Reset failed:", error.message);
  if (mongoose.connection.readyState === 1) mongoose.disconnect();
  process.exit(1);
});