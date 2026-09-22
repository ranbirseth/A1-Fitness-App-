const path = require("path");

// Load Backend/.env (JWT secrets) but NEVER let tests touch the project DB.
// dotenv sets MONGO_URI from .env first; we override it below so every test
// run talks only to the dedicated local test database.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { protect } = require("../src/middlewares/auth.middleware");
const User = require("../src/models/User");
const app = require("../src/app");

if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = "test-access-secret";
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const TEST_DB_URI =
  process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/a1fitness_auth_test";

let server = null;
let baseUrl = "";

async function connect() {
  await mongoose.connect(TEST_DB_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await User.init();
}

async function disconnect() {
  await mongoose.disconnect();
}

async function startServer() {
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

async function stopServer() {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
}

async function createUser(overrides = {}) {
  const defaults = {
    gymId: "MAIN",
    name: "Test User",
    email: `user-${Math.random().toString(36).slice(2, 10)}@test.com`,
    password: "password123",
    role: "admin",
    status: "active",
    branchCode: "MAIN"
  };
  const plainPassword = overrides.password ?? defaults.password;
  const doc = await User.create({ ...defaults, ...overrides });
  // Expose the ORIGINAL plaintext (the DB stores the bcrypt hash) so tests can
  // log in realistically without knowing the hash.
  doc.plainPassword = plainPassword;
  return doc;
}

async function post(pathName, body) {
  const res = await fetch(baseUrl + pathName, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function signAccess(overrides = {}, secret = process.env.JWT_ACCESS_SECRET) {
  const { sub, role, exp, iat, expiresIn } = overrides;
  const payload = { sub, role };
  const options = {};
  if (exp !== undefined) {
    payload.exp = exp;
    if (iat !== undefined) payload.iat = iat;
  } else {
    options.expiresIn = expiresIn || "15m";
  }
  return jwt.sign(payload, secret, options);
}

function signRefresh(overrides = {}, secret = process.env.JWT_REFRESH_SECRET) {
  const { sub, role, exp, iat, expiresIn } = overrides;
  const payload = { sub, role };
  const options = {};
  if (exp !== undefined) {
    payload.exp = exp;
    if (iat !== undefined) payload.iat = iat;
  } else {
    options.expiresIn = expiresIn || "7d";
  }
  return jwt.sign(payload, secret, options);
}

function callProtect(req) {
  return new Promise((resolve) => {
    const res = {};
    protect(req, res, (error) => resolve({ error, reqUser: req.user }));
  });
}

module.exports = {
  connect,
  disconnect,
  startServer,
  stopServer,
  createUser,
  post,
  signAccess,
  signRefresh,
  callProtect,
  User,
  TEST_DB_URI
};