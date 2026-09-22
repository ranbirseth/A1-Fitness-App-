const fs = require("fs");
const path = require("path");

// Env loading is anchored to THIS file (Backend/.env) so config is picked up
// no matter which directory the process is started from.
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  require("dotenv").config({ path: envFile });
}
require("dotenv").config();

const app = require("./src/app");
const { connectDb } = require("./src/config/db");

const port = Number(process.env.PORT || 5000);

const start = async () => {
  const dbReady = await connectDb();
  if (!dbReady && process.env.NODE_ENV === "production") {
    console.error("Exiting: database unavailable in production.");
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`A1 Fitness auth backend running on port ${port}`);
  });
};

start();