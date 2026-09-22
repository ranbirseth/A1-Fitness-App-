const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers");

before(async () => {
  await h.connect();
  await h.startServer();
});

after(async () => {
  await h.stopServer();
  await h.disconnect();
});

const LOGIN_PATH = "/api/auth/login";
const REFRESH_PATH = "/api/auth/refresh";
const LOGOUT_PATH = "/api/auth/logout";

function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function loginAs(user) {
  return h.post(LOGIN_PATH, {
    gymId: user.gymId,
    email: user.email,
    password: user.plainPassword,
    role: user.role
  });
}

// ============================================================
// LOGIN
// ============================================================

test("login: valid admin returns full session envelope", async () => {
  const user = await h.createUser({
    email: "admin.logintest@test.com",
    role: "admin",
    phone: "1234567890"
  });
  const res = await loginAs(user);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, "Login successful");

  const data = res.body.data;
  assert.ok(data, "data present");
  assert.equal(data.user.role, "admin");
  assert.equal(data.user.email, "admin.logintest@test.com");
  // Fields the RN frontend requires in its Session.user:
  for (const key of ["_id", "gymId", "branchCode", "name", "email", "phone", "role", "status"]) {
    assert.ok(key in data.user, `user.${key} present`);
  }
  assert.equal(data.user.branchCode, "MAIN");
  assert.equal(data.user.status, "active");
  assert.equal(data.user.phone, "1234567890");
  assert.ok(data.accessToken, "accessToken present");
  assert.ok(data.refreshToken, "refreshToken present");

  const stored = await h.User.findById(data.user._id);
  assert.equal(stored.refreshTokens.length, 1);
  assert.ok(stored.refreshTokens.includes(data.refreshToken));
});

test("login: valid superadmin returns superadmin role", async () => {
  const user = await h.createUser({
    email: "superadmin.logintest@test.com",
    role: "superadmin"
  });
  const res = await loginAs(user);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.role, "superadmin");
});

test("login: unknown email -> 401 INVALID_CREDENTIALS", async () => {
  await h.createUser({ email: "somebody@test.com", role: "admin" });
  const res = await h.post(LOGIN_PATH, {
    gymId: "MAIN",
    email: "nobody@test.com",
    password: "password123",
    role: "admin"
  });

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, "INVALID_CREDENTIALS");
  assert.equal(res.body.message, "Invalid credentials");
  assert.deepEqual(res.body.data, {});
});

test("login: wrong password -> 401 INVALID_CREDENTIALS", async () => {
  const user = await h.createUser({ email: "wrongpw@test.com", role: "admin" });
  const res = await h.post(LOGIN_PATH, {
    gymId: user.gymId,
    email: user.email,
    password: "totallyWrong1",
    role: "admin"
  });

  assert.equal(res.status, 401);
  assert.equal(res.body.code, "INVALID_CREDENTIALS");
});

test("login: inactive account -> 403 ACCOUNT_INACTIVE", async () => {
  const user = await h.createUser({
    email: "inactive.logintest@test.com",
    role: "admin",
    status: "inactive"
  });
  const res = await loginAs(user);

  assert.equal(res.status, 403);
  assert.equal(res.body.code, "ACCOUNT_INACTIVE");
  assert.equal(
    res.body.message,
    "Your account has been deactivated. Please contact admin."
  );
});

test("login: wrong role for the account -> 401 INVALID_CREDENTIALS", async () => {
  const admin = await h.createUser({ email: "rolecheck@test.com", role: "admin" });
  // admin asking for the superadmin role matches no doc -> generic 401
  const res = await h.post(LOGIN_PATH, {
    gymId: admin.gymId,
    email: admin.email,
    password: admin.plainPassword,
    role: "superadmin"
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "INVALID_CREDENTIALS");
});

test("login: unknown role value -> 401 INVALID_CREDENTIALS (no user matches)", async () => {
  const user = await h.createUser({ email: "unknownrole@test.com", role: "superadmin" });
  const res = await h.post(LOGIN_PATH, {
    gymId: user.gymId,
    email: user.email,
    password: user.plainPassword,
    role: "trainer"
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "INVALID_CREDENTIALS");
});

test("login: role omitted authenticates with stored role", async () => {
  const user = await h.createUser({ email: "norole@test.com", role: "superadmin" });
  const res = await h.post(LOGIN_PATH, {
    gymId: user.gymId,
    email: user.email,
    password: user.plainPassword
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.role, "superadmin");
});

test("login: missing required fields -> 400 VALIDATION_ERROR", async () => {
  const noPassword = await h.post(LOGIN_PATH, {
    gymId: "MAIN",
    email: "user@test.com"
  });
  assert.equal(noPassword.status, 400);
  assert.equal(noPassword.body.code, "VALIDATION_ERROR");
  assert.equal(noPassword.body.message, "Validation failed");
  assert.ok(noPassword.body.data && typeof noPassword.body.data === "object");

  const badEmail = await h.post(LOGIN_PATH, {
    gymId: "MAIN",
    email: "not-an-email",
    password: "password123"
  });
  assert.equal(badEmail.status, 400);
  assert.equal(badEmail.body.code, "VALIDATION_ERROR");

  const emptyBody = await h.post(LOGIN_PATH, {});
  assert.equal(emptyBody.status, 400);
  assert.equal(emptyBody.body.code, "VALIDATION_ERROR");
});

test("login: no leakage of password/hash in response", async () => {
  const user = await h.createUser({ email: "leak@test.com", role: "admin" });
  const res = await loginAs(user);
  const raw = JSON.stringify(res.body);
  assert.ok(!raw.includes(user.plainPassword), "password not echoed");
  assert.ok(!raw.includes("$2"), "bcrypt hash not echoed");
});

// ============================================================
// AUTH MIDDLEWARE (protect)
// ============================================================

test("protect: valid access token loads the user", async () => {
  const user = await h.createUser({ email: "protect.valid@test.com", role: "admin" });
  const token = h.signAccess({ sub: String(user._id), role: "admin" });
  const { error, reqUser } = await h.callProtect({
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(error, undefined);
  assert.ok(reqUser);
  assert.equal(String(reqUser._id), String(user._id));
  assert.equal(reqUser.gymId, "MAIN");
  assert.equal(reqUser.password, undefined, "password excluded from req.user");
  assert.equal(reqUser.refreshTokens, undefined, "refreshTokens excluded from req.user");
});

test("protect: missing token -> 401 Unauthorized", async () => {
  const { error } = await h.callProtect({ headers: {} });
  assert.equal(error.statusCode, 401);
  assert.equal(error.message, "Unauthorized");
});

test("protect: malformed token -> 401 Invalid token", async () => {
  const { error } = await h.callProtect({
    headers: { authorization: "Bearer not-a-jwt" }
  });
  assert.equal(error.statusCode, 401);
  assert.equal(error.message, "Invalid token");
});

test("protect: token signed with wrong secret -> 401 Invalid token", async () => {
  const token = h.signAccess({ sub: "000000000000000000000000", role: "admin" }, "wrong-secret");
  const { error } = await h.callProtect({
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(error.statusCode, 401);
  assert.equal(error.message, "Invalid token");
});

test("protect: expired access token -> 401 Invalid token", async () => {
  const token = h.signAccess({
    sub: "000000000000000000000000",
    role: "admin",
    exp: nowInSeconds() - 60,
    iat: nowInSeconds() - 120
  });
  const { error } = await h.callProtect({
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(error.statusCode, 401);
  assert.equal(error.message, "Invalid token");
});

test("protect: token for a user that no longer exists -> 401 Invalid token", async () => {
  const user = await h.createUser({ email: "deleted.user@test.com", role: "admin" });
  const token = h.signAccess({ sub: String(user._id), role: "admin" });
  await h.User.deleteOne({ _id: user._id });

  const { error } = await h.callProtect({
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(error.statusCode, 401);
  assert.equal(error.message, "Invalid token");
});

test("protect: inactive user -> 403 blocked", async () => {
  const user = await h.createUser({
    email: "protect.inactive@test.com",
    role: "admin",
    status: "inactive"
  });
  const token = h.signAccess({ sub: String(user._id), role: "admin" });
  const { error, reqUser } = await h.callProtect({
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(error.statusCode, 403);
  assert.equal(
    error.message,
    "Your account has been deactivated. Please contact admin."
  );
  assert.equal(reqUser, undefined);
});

// ============================================================
// REFRESH
// ============================================================

test("refresh: valid refresh token issues new access token", async () => {
  const user = await h.createUser({ email: "refresh.valid@test.com", role: "admin" });
  const loginRes = await loginAs(user);
  const refreshToken = loginRes.body.data.refreshToken;

  const res = await h.post(REFRESH_PATH, { refreshToken });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, "Token refreshed");
  assert.ok(res.body.data.accessToken, "new accessToken");
  assert.ok(res.body.data.refreshToken, "new refreshToken");
  // Note: the reference server signs refresh tokens with an identical payload,
  // so a token issued within the same second may be the identical string - the
  // rotation contract is that the array grows and the newest token stays usable.
  assert.ok(res.body.data.refreshToken.length > 20, "refresh token is a JWT");

  const viaNew = await h.post(REFRESH_PATH, {
    refreshToken: res.body.data.refreshToken
  });
  assert.equal(viaNew.status, 200, "returned refresh token is immediately usable");

  const stored = await h.User.findById(user._id);
  assert.equal(
    stored.refreshTokens.length,
    3,
    "login(1) + two refreshes in this test(2) are all retained"
  );
});

test("refresh: new access token works with protect", async () => {
  const user = await h.createUser({ email: "refresh.usable@test.com", role: "admin" });
  const loginRes = await loginAs(user);
  const res = await h.post(REFRESH_PATH, { refreshToken: loginRes.body.data.refreshToken });

  const { error, reqUser } = await h.callProtect({
    headers: { authorization: `Bearer ${res.body.data.accessToken}` }
  });
  assert.equal(error, undefined);
  assert.equal(String(reqUser._id), String(user._id));
});

test("refresh: garbage refresh token -> 401 INVALID_REFRESH_TOKEN", async () => {
  const res = await h.post(REFRESH_PATH, { refreshToken: "garbage.token.value" });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "INVALID_REFRESH_TOKEN");
});

test("refresh: expired refresh token -> 401 INVALID_REFRESH_TOKEN", async () => {
  const token = h.signRefresh({
    sub: "000000000000000000000000",
    role: "admin",
    exp: nowInSeconds() - 60
  });
  const res = await h.post(REFRESH_PATH, { refreshToken: token });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "INVALID_REFRESH_TOKEN");
});

test("refresh: no token -> 401 REFRESH_TOKEN_REQUIRED", async () => {
  const res = await h.post(REFRESH_PATH, {});
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "REFRESH_TOKEN_REQUIRED");
});

test("refresh: revoked refresh token (logged out) -> 401 REFRESH_TOKEN_REVOKED", async () => {
  const user = await h.createUser({ email: "refresh.revoked@test.com", role: "admin" });
  const loginRes = await loginAs(user);
  const refreshToken = loginRes.body.data.refreshToken;

  await h.post(LOGOUT_PATH, { refreshToken });

  const res = await h.post(REFRESH_PATH, { refreshToken });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "REFRESH_TOKEN_REVOKED");
});

test("refresh: rotation trims to the latest 4 and evicts the oldest token", async () => {
  const user = await h.createUser({ email: "refresh.cap@test.com", role: "admin" });

  // Five distinct, still-valid refresh tokens for this user (issued in the past
  // with an iat that differs, so each is a unique JWT string). This mirrors the
  // reference rotation contract: slice(-4) keeps the last four, then the newly
  // signed token is appended, so the steady-state array size is 5 (4 + new).
  const now = nowInSeconds();
  const tokens = [0, 1, 2, 3, 4].map((i) =>
    h.signRefresh({
      sub: String(user._id),
      role: "admin",
      iat: now - 100 + i,
      exp: now + 3600
    })
  );
  user.refreshTokens = tokens;
  await user.save();
  assert.equal(user.refreshTokens.length, 5);

  const res = await h.post(REFRESH_PATH, { refreshToken: tokens[4] });
  assert.equal(res.status, 200);

  const stored = await h.User.findById(user._id);
  assert.equal(stored.refreshTokens.length, 5, "steady-state array size is 5 (4 prior + 1 new)");
  assert.ok(!stored.refreshTokens.includes(tokens[0]), "oldest token rotated out");
  for (const token of tokens.slice(1)) {
    assert.ok(stored.refreshTokens.includes(token), "tokens 2..5 retained");
  }

  const evicted = await h.post(REFRESH_PATH, { refreshToken: tokens[0] });
  assert.equal(evicted.status, 401);
  assert.equal(evicted.body.code, "REFRESH_TOKEN_REVOKED");
});

// ============================================================
// LOGOUT
// ============================================================

test("logout: valid logout removes the refresh token", async () => {
  const user = await h.createUser({ email: "logout.valid@test.com", role: "admin" });
  const loginRes = await loginAs(user);
  const refreshToken = loginRes.body.data.refreshToken;

  const res = await h.post(LOGOUT_PATH, { refreshToken });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, "Logout successful");
  assert.deepEqual(res.body.data, {});

  const stored = await h.User.findById(user._id);
  assert.ok(!stored.refreshTokens.includes(refreshToken), "token removed");
});

test("logout: repeated logout with same token still succeeds", async () => {
  const user = await h.createUser({ email: "logout.repeat@test.com", role: "admin" });
  const loginRes = await loginAs(user);
  const refreshToken = loginRes.body.data.refreshToken;

  const first = await h.post(LOGOUT_PATH, { refreshToken });
  const second = await h.post(LOGOUT_PATH, { refreshToken });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.body.message, "Logout successful");
});

test("logout: invalid/expired refresh token still returns success", async () => {
  const res = await h.post(LOGOUT_PATH, { refreshToken: "garbage.token.value" });
  assert.equal(res.status, 200);
  assert.equal(res.body.message, "Logout successful");
});

test("logout: expired-token logout returns success and leaves no session", async () => {
  const token = h.signRefresh({
    sub: "000000000000000000000000",
    role: "admin",
    exp: nowInSeconds() - 60
  });
  const res = await h.post(LOGOUT_PATH, { refreshToken: token });
  assert.equal(res.status, 200);
  assert.equal(res.body.message, "Logout successful");
});

test("logout: missing token -> 401 REFRESH_TOKEN_REQUIRED", async () => {
  const res = await h.post(LOGOUT_PATH, {});
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "REFRESH_TOKEN_REQUIRED");
});