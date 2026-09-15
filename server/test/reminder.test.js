const {
  describe,
  it,
  before,
  after,
  beforeEach,
  afterEach,
} = require("node:test");
const assert = require("node:assert/strict");

const {
  WhatsAppService,
  buildTemplateMessage,
  normalizePhoneNumber,
  validatePhoneNumber,
  sanitizeMetaError,
  classifyMetaError,
} = require("../services/whatsapp.service");
const reminder = require("../services/reminder.service");
const {
  enforceBranchOwnership,
  branchScope,
} = require("../middlewares/branchScope.middleware");

// ── Environment isolation: keep the shared singleton in a known state ──
const WA_ENV_KEYS = [
  "WHATSAPP_PROVIDER",
  "WHATSAPP_ENABLED",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_API_VERSION",
  "WHATSAPP_TEMPLATE_NAME",
  "WHATSAPP_TEMPLATE_LANGUAGE",
  "WHATSAPP_COUNTRY_CODE",
  "WHATSAPP_MAX_SENDS_PER_REQUEST",
];
const savedEnv = {};
before(() => {
  for (const key of WA_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});
after(() => {
  for (const key of WA_ENV_KEYS) {
    if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
    else delete process.env[key];
  }
});

const DELETE_WHATSAPP = () =>
  WA_ENV_KEYS.forEach((key) => delete process.env[key]);
beforeEach(DELETE_WHATSAPP);
afterEach(DELETE_WHATSAPP);

const DAYS = (n) => n * 24 * 60 * 60 * 1000;

const makeMember = (overrides = {}) => ({
  _id: "64abcd",
  gymId: "MAIN",
  branchCode: "MAIN",
  status: "active",
  paymentStatus: "paid",
  currentPlan: { _id: "p1", name: "Monthly Gold" },
  membershipStartDate: null,
  membershipExpiryDate: null,
  user: { name: "Rahul Sharma", phone: "+91 98765 43210" },
  ...overrides,
});

// ── A: Missing Meta configuration -> not_configured, NO fake delivery ──
describe("WhatsApp service: missing configuration", () => {
  it("returns not_configured and never calls the network when provider/keyabsent", async () => {
    for (const env of [
      {},
      { WHATSAPP_PROVIDER: "meta" },
      { WHATSAPP_PROVIDER: "meta", WHATSAPP_ACCESS_TOKEN: "tok" },
      { WHATSAPP_PROVIDER: "meta", WHATSAPP_PHONE_NUMBER_ID: "phone-id" },
    ]) {
      let networkCalls = 0;
      const svc = new WhatsAppService({
        env,
        fetch: async () => {
          networkCalls += 1;
          throw new Error("fetch must not be called");
        },
      });
      const result = await svc.sendTemplateMessage({
        to: "+919876543210",
        parameters: ["a", "b"],
      });
      assert.equal(result.status, "not_configured", JSON.stringify(env));
      assert.equal(result.sent, false, JSON.stringify(env));
      assert.equal(networkCalls, 0, JSON.stringify(env));
    }
  });

  it("explicit WHATSAPP_ENABLED=false disables an otherwise configured provider", async () => {
    let networkCalls = 0;
    const svc = new WhatsAppService({
      env: {
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_ENABLED: "false",
        WHATSAPP_ACCESS_TOKEN: "tok",
        WHATSAPP_PHONE_NUMBER_ID: "phone-id",
      },
      fetch: async () => {
        networkCalls += 1;
        throw new Error("should not call");
      },
    });
    const result = await svc.sendTemplateMessage({ to: "+919876543210" });
    assert.equal(result.status, "not_configured");
    assert.equal(result.sent, false);
    assert.equal(networkCalls, 0);
  });

  it("reports which WHOLE vars are missing (names only, never values)", async () => {
    const svc = new WhatsAppService({
      env: {
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_ENABLED: "true",
        WHATSAPP_ACCESS_TOKEN: "tok_secret",
      },
      fetch: async () => {
        throw new Error("fetch must not be called");
      },
    });
    const result = await svc.sendTemplateMessage({ to: "+919876543210" });
    assert.equal(result.status, "not_configured");
    assert.equal(result.hasAccessToken, true);
    assert.equal(result.hasPhoneNumberId, false);
    assert.ok(Array.isArray(result.missing));
    assert.ok(
      result.missing.includes("WHATSAPP_PHONE_NUMBER_ID"),
      result.missing.join(","),
    );
    assert.ok(!result.missing.includes("WHATSAPP_ACCESS_TOKEN"));
    assert.ok(
      !JSON.stringify(result).includes("tok_secret"),
      "no value must leak into the result",
    );
    assert.ok(
      result.reason.includes("WHATSAPP_PHONE_NUMBER_ID"),
      result.reason,
    );
  });

  it("reports when WHATSAPP_PROVIDER is not 'meta' so the reason is actionable", async () => {
    const svc = new WhatsAppService({
      env: {
        WHATSAPP_PROVIDER: "twilio",
        WHATSAPP_ACCESS_TOKEN: "t",
        WHATSAPP_PHONE_NUMBER_ID: "1",
      },
      fetch: async () => {
        throw new Error("fetch must not be called");
      },
    });
    const result = await svc.sendTemplateMessage({ to: "+919876543210" });
    assert.equal(result.status, "not_configured");
    assert.equal(result.enabled, true);
    assert.ok(
      result.missing.some((m) => m.includes("WHATSAPP_PROVIDER")),
      result.missing.join(","),
    );
  });
});

// ── B/G: Valid config -> correct Meta request structure ──
describe("WhatsApp service: configured request structure", () => {
  it("builds the exact Meta Cloud API JSON body", () => {
    const payload = buildTemplateMessage({
      to: "919876543210",
      templateName: "a1_fitness_membership_reminder",
      languageCode: "en",
      parameters: [
        "Rahul Sharma",
        "A1 Branch",
        "Monthly Gold",
        "08 Aug 2026",
        "08 Sep 2026",
        "7",
      ],
    });
    assert.equal(payload.messaging_product, "whatsapp");
    assert.equal(payload.recipient_type, "individual");
    assert.equal(payload.to, "919876543210");
    assert.equal(payload.type, "template");
    assert.equal(payload.template.name, "a1_fitness_membership_reminder");
    assert.equal(payload.template.language.code, "en");
    assert.deepEqual(payload.template.components[0].parameters, [
      { type: "text", text: "Rahul Sharma" },
      { type: "text", text: "A1 Branch" },
      { type: "text", text: "Monthly Gold" },
      { type: "text", text: "08 Aug 2026" },
      { type: "text", text: "08 Sep 2026" },
      { type: "text", text: "7" },
    ]);
  });

  it("sends hello_world WITHOUT any components/parameters (0 placeholders)", () => {
    const payload = buildTemplateMessage({
      to: "919475265880",
      templateName: "hello_world",
      languageCode: "en_US",
      parameters: [
        "Rahul Sharma",
        "A1 Branch",
        "Monthly Gold",
        "08 Aug 2026",
        "08 Sep 2026",
        "7",
      ],
    });
    assert.equal(payload.template.name, "hello_world");
    assert.equal(payload.template.language.code, "en_US");
    assert.equal(payload.template.components, undefined);
    assert.deepEqual(payload.template.components, undefined);
  });

  it("preserves parameters for templates that do use placeholders", () => {
    const payload = buildTemplateMessage({
      to: "919876543210",
      templateName: "membership_expiry_reminder",
      languageCode: "en",
      parameters: ["Rahul Sharma", "A1 Branch", "Monthly Gold"],
    });
    assert.ok(payload.template.components, "body component expected");
    assert.deepEqual(payload.template.components[0].parameters, [
      { type: "text", text: "Rahul Sharma" },
      { type: "text", text: "A1 Branch" },
      { type: "text", text: "Monthly Gold" },
    ]);
  });

  it("sends the correct URL/headers/body and reports sent only on a real message id", async () => {
    let captured;
    const svc = new WhatsAppService({
      env: {
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_ACCESS_TOKEN: "tok_secret",
        WHATSAPP_PHONE_NUMBER_ID: "111222333",
        WHATSAPP_API_VERSION: "v21.0",
      },
      fetch: async (url, opts) => {
        captured = { url, opts };
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: "wamid.g0d4" }] }),
        };
      },
    });
    const result = await svc.sendTemplateMessage({
      to: "+91 98765 43210",
      templateName: "tpl_x",
      languageCode: "hi",
      parameters: ["A"],
    });

    assert.equal(result.status, "sent");
    assert.equal(result.sent, true);
    assert.equal(result.metaMessageId, "wamid.g0d4");
    assert.ok(captured.url.includes("/v21.0/111222333/messages"), captured.url);
    assert.equal(captured.opts.method, "POST");
    assert.equal(captured.opts.headers.Authorization, "Bearer tok_secret");
    const body = JSON.parse(captured.opts.body);
    assert.equal(body.to, "919876543210");
    assert.equal(body.template.name, "tpl_x");
    assert.equal(body.template.language.code, "hi");
  });
});

// ── Meta failures: sanitized, never expose secrets ──
describe("WhatsApp service: error handling is sanitized", () => {
  it("maps failed responses to meta_api_error without leaking the access token", async () => {
    const svc = new WhatsAppService({
      env: {
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_ACCESS_TOKEN: "SUPER_SECRET_TOKEN",
        WHATSAPP_PHONE_NUMBER_ID: "111222",
      },
      fetch: async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 130429,
            message: "potentially [SUPER_SECRET_TOKEN] inside",
          },
        }),
      }),
    });
    const result = await svc.sendTemplateMessage({
      to: "919876543210",
      parameters: ["a"],
    });
    assert.equal(result.status, "meta_api_error");
    assert.equal(result.sent, false);
    assert.ok(!result.reason.includes("SUPER_SECRET_TOKEN"), result.reason);
    assert.equal(result.metaErrorCode, 130429);
  });

  it("transport errors are reported as failed, not sent", async () => {
    const svc = new WhatsAppService({
      env: {
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_ACCESS_TOKEN: "t",
        WHATSAPP_PHONE_NUMBER_ID: "1",
      },
      fetch: async () => {
        throw new Error("ECONNRESET");
      },
    });
    const result = await svc.sendTemplateMessage({ to: "919876543210" });
    assert.equal(result.status, "failed");
    assert.equal(result.sent, false);
  });

  it("sanitizeMetaError truncates and never includes raw request data", () => {
    const msg = sanitizeMetaError(400, { error: { message: "x".repeat(500) } });
    assert.ok(msg.length <= 215);
    assert.ok(msg.startsWith("HTTP 400:"));
  });
});

// ── Safe configuration snapshot ──
describe("WhatsApp service: safe configuration snapshot", () => {
  it("reports exact booleans/values and NEVER exposes the access token", () => {
    const svc = new WhatsAppService({
      env: {
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_ENABLED: "true",
        WHATSAPP_ACCESS_TOKEN: "SUPER_TOPSECRET_TOKEN",
        WHATSAPP_PHONE_NUMBER_ID: "111222333",
        WHATSAPP_BUSINESS_ACCOUNT_ID: "444555666",
        WHATSAPP_API_VERSION: "v21.0",
        WHATSAPP_TEMPLATE_NAME: "membership_expiry_reminder",
        WHATSAPP_TEMPLATE_LANGUAGE: "en",
        WHATSAPP_COUNTRY_CODE: "91",
      },
    });
    const cfg = svc.getSafeConfig();
    assert.equal(cfg.provider, "meta");
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.configured, true);
    assert.equal(cfg.hasAccessToken, true);
    assert.equal(cfg.hasPhoneNumberId, true);
    assert.equal(cfg.hasBusinessAccountId, true);
    assert.equal(cfg.templateName, "membership_expiry_reminder");
    assert.equal(cfg.apiVersion, "v21.0");
    assert.ok(
      !JSON.stringify(cfg).includes("SUPER_TOPSECRET_TOKEN"),
      JSON.stringify(cfg),
    );
  });

  it("WHATSAPP_ENABLED=false is reflected in the snapshot even when credentials exist", () => {
    const svc = new WhatsAppService({
      env: {
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_ENABLED: "false",
        WHATSAPP_ACCESS_TOKEN: "tok",
        WHATSAPP_PHONE_NUMBER_ID: "111",
      },
    });
    const cfg = svc.getSafeConfig();
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.configured, false);
  });

  it("reports configured=false and remembers the missing pieces when credentials are absent", () => {
    const svc = new WhatsAppService({ env: { WHATSAPP_PROVIDER: "meta" } });
    const cfg = svc.getSafeConfig();
    assert.equal(cfg.configured, false);
    assert.equal(cfg.hasAccessToken, false);
    assert.equal(cfg.hasPhoneNumberId, false);
  });
});

// ── Meta error classification ──
describe("WhatsApp service: Meta error classification", () => {
  it("maps invalid/expired OAuth tokens to invalid_token", () => {
    const c = classifyMetaError(
      400,
      {
        error: { code: 190, message: "Session has expired. Re-authenticate." },
      },
      "TOKEN",
    );
    assert.equal(c.status, "invalid_token");
    assert.equal(c.metaErrorCode, 190);
  });

  it("maps invalid recipient phone numbers to invalid_phone_number", () => {
    const c = classifyMetaError(
      400,
      {
        error: {
          code: 100,
          error_subcode: 131030,
          message: "Phone number is not a valid phone number.",
        },
      },
      null,
    );
    assert.equal(c.status, "invalid_phone_number");
    assert.equal(c.metaErrorSubcode, 131030);
  });

  it("maps missing templates to template_not_found", () => {
    const c = classifyMetaError(
      400,
      {
        error: {
          code: 100,
          error_subcode: 132030,
          message: "Template not found.",
        },
      },
      null,
    );
    assert.equal(c.status, "template_not_found");
    assert.equal(c.metaErrorSubcode, 132030);
  });

  it("maps unapproved templates to template_not_approved", () => {
    const c = classifyMetaError(
      400,
      { error: { code: 100, message: "Message template is not approved." } },
      null,
    );
    assert.equal(c.status, "template_not_approved");
  });

  it("falls back to meta_api_error and redacts the token from the safe message", () => {
    const c = classifyMetaError(
      500,
      {
        error: { code: 2, message: "Unexpected error with SUPERSECRET inside" },
      },
      "SUPERSECRET",
    );
    assert.equal(c.status, "meta_api_error");
    assert.equal(c.metaErrorCode, 2);
    assert.ok(!c.safeMessage.includes("SUPERSECRET"));
  });

  it("sendTemplateMessage surfaces the classified status with safe reason + error code", async () => {
    const svc = new WhatsAppService({
      env: {
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_ACCESS_TOKEN: "tok_secret",
        WHATSAPP_PHONE_NUMBER_ID: "111",
      },
      fetch: async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 190, message: "Error with tok_secret inside" },
        }),
      }),
    });
    const result = await svc.sendTemplateMessage({
      to: "+919876543210",
      parameters: ["a"],
    });
    assert.equal(result.status, "invalid_token");
    assert.equal(result.sent, false);
    assert.equal(result.metaErrorCode, 190);
    assert.ok(!result.reason.includes("tok_secret"), result.reason);
  });
});

// ── C: Phone normalization / validation ──
describe("Phone normalization (Indian gym numbering)", () => {
  it("normalizes common Indian number formats to E.164 digits", () => {
    assert.equal(normalizePhoneNumber("+91 98765 43210"), "919876543210");
    assert.equal(normalizePhoneNumber("91 98765 43210"), "919876543210");
    assert.equal(normalizePhoneNumber("9876543210"), "919876543210");
    assert.equal(normalizePhoneNumber("919876543210"), "919876543210");
    assert.equal(normalizePhoneNumber("0 98765 43210"), "919876543210");
    assert.equal(normalizePhoneNumber("+91-98765-43210"), "919876543210");
  });

  it("rejects ambiguous numbers instead of guessing", () => {
    assert.equal(normalizePhoneNumber("78656647534"), null); // ambiguous 11-digit
    assert.equal(normalizePhoneNumber(""), null);
    assert.equal(normalizePhoneNumber(null), null);
    assert.equal(normalizePhoneNumber(undefined), null);
    assert.equal(normalizePhoneNumber("call me later"), null);
    assert.equal(normalizePhoneNumber(9876543210), "919876543210");
  });

  it("validates the structural E.164 shape", () => {
    assert.ok(validatePhoneNumber("919876543210"));
    assert.ok(!validatePhoneNumber("09876543210"));
    assert.ok(!validatePhoneNumber("123"));
    assert.ok(!validatePhoneNumber(null));
  });

  it("rejects an invalid recipient without calling Meta (invalid_phone_number)", async () => {
    let networkCalls = 0;
    const svc = new WhatsAppService({
      env: {
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_ACCESS_TOKEN: "t",
        WHATSAPP_PHONE_NUMBER_ID: "1",
      },
      fetch: async () => {
        networkCalls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: "x" }] }),
        };
      },
    });
    const result = await svc.sendTemplateMessage({
      to: "not-a-phone",
      parameters: [],
    });
    assert.equal(result.status, "invalid_phone_number");
    assert.equal(result.sent, false);
    assert.equal(networkCalls, 0);
  });
});

// ── D/E/F/G: Eligibility rules ──
describe("Reminder eligibility", () => {
  const NOW = new Date("2026-09-08T10:30:00");
  const activePlan = { _id: "p1", name: "Gold" };

  it("D: pending payment/membership is eligible", () => {
    const el = reminder.computeEligibility(
      { status: "pending", paymentStatus: "pending" },
      NOW,
    );
    assert.equal(el.eligible, true);
    assert.deepEqual(el.reasons, ["pending_payment"]);
  });

  it("E: active membership expiring today is eligible (0 days left)", () => {
    const el = reminder.computeEligibility(
      {
        status: "active",
        paymentStatus: "paid",
        currentPlan: activePlan,
        membershipExpiryDate: new Date("2026-09-08T08:00:00"),
      },
      NOW,
    );
    assert.equal(el.eligible, true);
    assert.ok(el.reasons.includes("expiring_soon"));
    assert.equal(el.daysRemaining, 0);
  });

  it("E: expiring in exactly 7 days is eligible", () => {
    const el = reminder.computeEligibility(
      {
        status: "active",
        paymentStatus: "paid",
        currentPlan: activePlan,
        membershipExpiryDate: new Date("2026-09-15T08:00:00"),
      },
      NOW,
    );
    assert.equal(el.eligible, true);
    assert.equal(el.daysRemaining, 7);
  });

  it("F: expiring in 8 days is NOT eligible", () => {
    const el = reminder.computeEligibility(
      {
        status: "active",
        paymentStatus: "paid",
        currentPlan: activePlan,
        membershipExpiryDate: new Date("2026-09-16T08:00:00"),
      },
      NOW,
    );
    assert.equal(el.eligible, false);
    assert.equal(el.reasons, null);
  });

  it("F: expiring next month is NOT eligible even when payment is pending", () => {
    const el = reminder.computeEligibility(
      {
        status: "active",
        paymentStatus: "pending",
        currentPlan: activePlan,
        membershipExpiryDate: new Date("2026-12-01"),
      },
      NOW,
    );
    assert.equal(el.eligible, true); // pending rule applies ..
    assert.deepEqual(el.reasons, ["pending_payment"]); // .. but NOT the expiry rule
  });

  it("G: expired memberships are excluded", () => {
    assert.equal(
      reminder.computeEligibility(
        {
          status: "expired",
          paymentStatus: "pending",
          membershipExpiryDate: new Date("2026-09-01"),
        },
        NOW,
      ).eligible,
      false,
    );
    assert.equal(
      reminder.computeEligibility(
        {
          status: "active",
          paymentStatus: "paid",
          currentPlan: activePlan,
          membershipExpiryDate: new Date("2026-09-01"),
        },
        NOW,
      ).eligible,
      false, // expiry is in the past -> not inside the window
    );
  });

  it("cancelled/inactive/frozen memberships are excluded", () => {
    for (const status of ["cancelled", "inactive", "frozen"]) {
      const el = reminder.computeEligibility(
        {
          status,
          paymentStatus: "pending",
          currentPlan: activePlan,
          membershipExpiryDate: new Date("2026-09-10"),
        },
        NOW,
      );
      assert.equal(el.eligible, false, status);
    }
  });

  it("computeDaysRemaining uses calendar days", () => {
    assert.equal(
      reminder.computeDaysRemaining(new Date("2026-09-08T05:00:00"), NOW),
      0,
    );
    assert.equal(
      reminder.computeDaysRemaining(new Date("2026-09-15T23:59:00"), NOW),
      7,
    );
    assert.equal(
      reminder.computeDaysRemaining(new Date("2026-09-16T00:00:00"), NOW),
      8,
    );
  });

  it("the DB eligibility filter mirrors the pure rule and applies branch scope", () => {
    const filter = reminder.buildEligibilityFilter({
      gymId: "MAIN",
      branchCode: "BLR",
      now: NOW,
    });
    assert.equal(filter.gymId, "MAIN");
    assert.equal(filter.branchCode, "BLR");
    assert.deepEqual(filter.status, { $in: ["active", "pending"] });
    const hasPending = filter.$or.some((c) => c.paymentStatus === "pending");
    const hasExpiring = filter.$or.some(
      (c) =>
        c.status === "active" &&
        c.membershipExpiryDate &&
        c.membershipExpiryDate.$gte,
    );
    assert.ok(hasPending && hasExpiring);
  });
});

// ── H/I/J: Branch authorization ──
describe("Branch authorization", () => {
  it("H: admin may operate on their own branch", () => {
    const req = { user: { role: "admin", branchCode: "MAIN" } };
    assert.equal(enforceBranchOwnership("MAIN", req), true);
  });

  it("I: admin targetting another branch is rejected", () => {
    const req = { user: { role: "admin", branchCode: "MAIN" } };
    assert.equal(enforceBranchOwnership("KOLKATA", req), false);
  });

  it("J: superadmin bypasses branch ownership", () => {
    const req = { user: { role: "superadmin", branchCode: "MAIN" } };
    assert.equal(enforceBranchOwnership("ANYWHERE", req), true);
  });

  it("branchScope locks non-superadmins to their own branch and ignores client branchCode", async () => {
    const req = {
      user: { role: "admin", branchCode: "DELHI" },
      query: { branchCode: "MUMBAI" },
    };
    await new Promise((resolve, reject) =>
      branchScope(req, null, (err) => (err ? reject(err) : resolve())),
    );
    assert.equal(req.branchCode, "DELHI");
    assert.equal(req.query.branchCode, "DELHI");
  });

  it("branchScope lets superadmin select a branch or view ALL", async () => {
    const reqA = { user: { role: "superadmin" }, query: { branchCode: "HYD" } };
    await new Promise((resolve, reject) =>
      branchScope(reqA, null, (err) => (err ? reject(err) : resolve())),
    );
    assert.equal(reqA.branchCode, "HYD");

    const reqB = { user: { role: "superadmin" }, query: { branchCode: "ALL" } };
    await new Promise((resolve, reject) =>
      branchScope(reqB, null, (err) => (err ? reject(err) : resolve())),
    );
    assert.equal(reqB.branchCode, undefined);
    assert.equal(reqB.query.branchCode, undefined);
  });
});

// ── L: Real member data + A: end-to-end not_configured + M: in-app preserved ──
describe("Per-member reminder pass", () => {
  it("uses DB-derived data, keeps the in-app expiry notification, and does NOT fake WhatsApp", async () => {
    process.env.WHATSAPP_PROVIDER = "meta"; // NB: token/id intentionally absent
    const now = new Date("2026-09-08T10:00:00");
    const member = makeMember({
      status: "active",
      paymentStatus: "paid",
      currentPlan: { _id: "p1", name: "Monthly Gold" },
      membershipStartDate: new Date("2026-08-09T00:00:00"),
      membershipExpiryDate: new Date("2026-09-15T00:00:00"),
      user: { name: "Rahul Sharma", phone: "+91 98765 43210" },
    });

    const result = await reminder.sendReminderForMember(member, {
      reminderDate: reminder.startOfDay(now),
      now,
      hasSent: async () => false,
      createNotif: async () => ({}),
      branchNameResolver: async () => "A1 Fitness Branch 1",
      hasWhatsappSent: async () => false,
    });

    assert.equal(result.memberName, "Rahul Sharma");
    assert.equal(result.whatsappNumber, "919876543210");
    assert.equal(result.planName, "Monthly Gold");
    assert.equal(result.branchCode, "MAIN");
    assert.equal(result.daysRemaining, 7);
    assert.deepEqual(result.eligibilityReasons, ["expiring_soon"]);
    assert.equal(result.inAppNotification, "created");
    assert.equal(result.whatsappStatus, "not_configured");
    assert.notEqual(result.whatsappStatus, "sent");
    assert.equal(result.metaMessageId, undefined);
  });

  it("skips an expired term instead of messaging a lapsed membership", async () => {
    const now = new Date("2026-09-08T10:00:00");
    const member = makeMember({
      status: "active",
      paymentStatus: "pending",
      currentPlan: { _id: "p1", name: "Monthly Gold" },
      membershipStartDate: new Date("2026-08-01T00:00:00"),
      membershipExpiryDate: new Date("2026-08-31T00:00:00"),
      user: { name: "Rahul Sharma", phone: "+91 98765 43210" },
    });
    const result = await reminder.sendReminderForMember(member, {
      reminderDate: reminder.startOfDay(now),
      now,
      hasSent: async () => false,
      createNotif: async () => ({}),
      branchNameResolver: async () => "",
    });
    assert.equal(result.whatsappStatus, "skipped");
    assert.equal(result.whatsappReason, "membership_expired");
  });

  it("a pending member with no membership dates is eligible but WhatsApp is skipped safely", async () => {
    const now = new Date("2026-09-08T10:00:00");
    const member = makeMember({
      status: "pending",
      paymentStatus: "pending",
      membershipStartDate: null,
      membershipExpiryDate: null,
    });
    const result = await reminder.sendReminderForMember(member, {
      reminderDate: reminder.startOfDay(now),
      now,
    });
    assert.deepEqual(result.eligibilityReasons, ["pending_payment"]);
    assert.equal(result.inAppNotification, "skipped");
    assert.equal(result.whatsappStatus, "skipped");
    assert.equal(result.whatsappReason, "no_membership_dates");
  });

  it("builds the ordered template parameters purely from member/DB values", () => {
    const member = makeMember({
      membershipStartDate: new Date("2026-08-09T00:00:00"),
      membershipExpiryDate: new Date("2026-09-15T00:00:00"),
    });
    const params = reminder.buildTemplateParameters(
      member,
      "A1 FITNESS - MAIN",
      new Date("2026-09-08T10:00:00"),
    );
    assert.deepEqual(params, [
      "Rahul Sharma",
      "A1 FITNESS - MAIN",
      "Monthly Gold",
      "09 Aug 2026",
      "15 Sept 2026",
      "7",
    ]);
  });

  it("skips the WhatsApp send when a successful reminder was already recorded today (duplicate)", async () => {
    const now = new Date("2026-09-08T10:00:00");
    const member = makeMember({
      status: "active",
      paymentStatus: "paid",
      currentPlan: { _id: "p1", name: "Monthly Gold" },
      membershipStartDate: new Date("2026-08-09T00:00:00"),
      membershipExpiryDate: new Date("2026-09-15T00:00:00"),
      user: { name: "Rahul Sharma", phone: "+91 98765 43210" },
    });
    let sendCalls = 0;
    const result = await reminder.sendReminderForMember(member, {
      reminderDate: reminder.startOfDay(now),
      now,
      hasSent: async () => false,
      createNotif: async () => ({}),
      branchNameResolver: async () => "A1 FITNESS Branch",
      hasWhatsappSent: async () => true,
      whatsappSender: {
        normalizePhoneNumber: () => "919876543210",
        getTemplateName: () => "membership_expiry_reminder",
        sendTemplateMessage: async () => {
          sendCalls += 1;
          return { status: "sent", sent: true, metaMessageId: "wamid.nope" };
        },
      },
      createWhatsappNotif: async () => ({}),
    });
    assert.equal(result.whatsappStatus, "duplicate");
    assert.equal(result.whatsappReason, "alreadysent_on_reminder_date");
    assert.equal(
      sendCalls,
      0,
      "Meta must not be called again for a recorded duplicate",
    );
  });

  it("records a WhatsApp reminder ONLY after Meta confirms delivery with a message id", async () => {
    const now = new Date("2026-09-08T10:00:00");
    const member = makeMember({
      status: "active",
      paymentStatus: "paid",
      currentPlan: { _id: "p1", name: "Monthly Gold" },
      membershipStartDate: new Date("2026-08-09T00:00:00"),
      membershipExpiryDate: new Date("2026-09-15T00:00:00"),
      user: { name: "Rahul Sharma", phone: "+91 98765 43210" },
    });
    const persisted = [];
    const result = await reminder.sendReminderForMember(member, {
      reminderDate: reminder.startOfDay(now),
      now,
      hasSent: async () => false,
      createNotif: async () => ({}),
      branchNameResolver: async () => "A1 FITNESS Branch",
      hasWhatsappSent: async () => false,
      whatsappSender: {
        normalizePhoneNumber: () => "919876543210",
        getTemplateName: () => "membership_expiry_reminder",
        sendTemplateMessage: async () => ({
          status: "sent",
          sent: true,
          provider: "meta",
          metaMessageId: "wamid.confirmed123",
        }),
      },
      createWhatsappNotif: async (m, rd, mid) => {
        persisted.push({ m, rd, mid });
        return {};
      },
    });
    assert.equal(result.whatsappStatus, "sent");
    assert.equal(result.metaMessageId, "wamid.confirmed123");
    assert.equal(
      persisted.length,
      1,
      "a confirmed send must be persisted exactly once",
    );
    assert.equal(persisted[0].mid, "wamid.confirmed123");
  });

  it("does NOT record a failed WhatsApp attempt, so a retry is possible", async () => {
    const now = new Date("2026-09-08T10:00:00");
    const member = makeMember({
      status: "active",
      paymentStatus: "paid",
      currentPlan: { _id: "p1", name: "Monthly Gold" },
      membershipStartDate: new Date("2026-08-09T00:00:00"),
      membershipExpiryDate: new Date("2026-09-15T00:00:00"),
      user: { name: "Rahul Sharma", phone: "+91 98765 43210" },
    });
    const persisted = [];
    const result = await reminder.sendReminderForMember(member, {
      reminderDate: reminder.startOfDay(now),
      now,
      hasSent: async () => false,
      createNotif: async () => ({}),
      branchNameResolver: async () => "A1 FITNESS Branch",
      hasWhatsappSent: async () => false,
      whatsappSender: {
        normalizePhoneNumber: () => "919876543210",
        getTemplateName: () => "membership_expiry_reminder",
        sendTemplateMessage: async () => ({
          status: "invalid_token",
          sent: false,
          provider: "meta",
          reason: "HTTP 400: Session has expired.",
          metaErrorCode: 190,
          metaErrorSubcode: null,
        }),
      },
      createWhatsappNotif: async (m, rd, mid) => {
        persisted.push({ m, rd, mid });
        return {};
      },
    });
    assert.equal(result.whatsappStatus, "invalid_token");
    assert.equal(result.metaErrorCode, 190);
    assert.equal(
      persisted.length,
      0,
      "a failed send must never be recorded as sent",
    );
  });
});
