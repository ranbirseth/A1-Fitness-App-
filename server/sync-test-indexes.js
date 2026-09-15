const mongoose = require("mongoose");
const Payment = require("./models/payment.model");

const URI = "mongodb+srv://ranbirseth7679554766_db_user:Eg0Pt9E1WToLyjZp@a1-fitness.j92wdbq.mongodb.net/gymza_payflow_test?retryWrites=true&w=majority";

(async () => {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 });
  const coll = Payment.collection;

  // Drop the two old sparse indexes if they exist
  for (const name of ["gymId_1_termKey_1", "gymId_1_idempotencyKey_1"]) {
    const exists = (await coll.listIndexes().toArray()).some((i) => i.name === name);
    if (exists) {
      try { await coll.dropIndex(name); console.log("dropped stale index:", name); }
      catch (e) { console.log("failed to drop index:", name, e.message); }
    } else {
      console.log("no stale index to drop:", name);
    }
  }

  // Recreate the partial-filter indexes from the (updated) schema
  const result = await Payment.syncIndexes();
  console.log("syncIndexes result:", result);

  console.log("\n=== ACTUAL INDEX DEFINITIONS on payments (gymza_payflow_test) ===");
  const idx = await coll.listIndexes().toArray();
  idx.forEach((i) => {
    console.log("name:", i.name, "| keys:", JSON.stringify(i.key), "| unique:", !!i.unique, "| partialFilterExpression:", i.partialFilterExpression ? JSON.stringify(i.partialFilterExpression) : "none");
  });

  await mongoose.disconnect();
})();