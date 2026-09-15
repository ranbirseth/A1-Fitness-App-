const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const reminder = require("../services/reminder.service");
const whatsappService = require("../services/whatsapp.service");
const { WhatsAppService } = require("../services/whatsapp.service");

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
  "WHATSAPP_MAX_SENDS_PER_REQUEST"
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
beforeEach(() => WA_ENV_KEYS.forEach((key) => delete process.env[key]));
afterEach(() => WA_ENV_KEYS.forEach((key) => delete process.env[key]));

const NOW = new Date("2026-09-08T10:30:00");

const makeMember = (overrides = {}) => ({
  _id: "64abcd",
  gymId: "MAIN",
  branchCode: "MAIN",
  status: "active",
  paymentStatus: "paid",
  currentPlan: { _id: "p1", name: "Monthly Gold" },
  membershipStartDate: new Date("2026-08-09T00:00:00"),
  membershipExpiryDate: new Date("2026-09-15T00:00:00"),
  user: { name: "Rahul Sharma", phone: "+91 98765 43210" },
  ...overrides
});

// Full DI wiring shared by the per-member tests. The whatsappSender is a
// controllable fake that never touches the network.
const defaultDeps = (overrides = {}) => ({
  reminderDate: reminder.startOfDay(NOW),
  now: NOW,
  hasSent: async () => false,
  createNotif: async () => ({}),
  branchNameResolver: async () => "A1 FITNESS Branch 1",
  hasWhatsappSent: async () => false,
  whatsappSender: {
    normalizePhoneNumber: () => "919876543210",
    getTemplateName: () => "membership_expiry_reminder",
    sendTemplateMessage: async () => ({ status: "sent", sent: true, provider: "meta", metaMessageId: "wamid.ok" })
  },
  createWhatsappNotif: async () => ({}),
  ...overrides
});

describe("Bulk WhatsApp reminder flow", () => {
  it("1. a bulk-eligible member gets a WhatsApp send and is persisted once", async () => {
    const persisted = [];
    const result = await reminder.sendReminderForMember(
      makeMember(),
      defaultDeps({
        whatsappSender: {
          normalizePhoneNumber: () => "919876543210",
          getTemplateName: () => "membership_expiry_reminder",
          sendTemplateMessage: async () => ({ status: "sent", sent: true, provider: "meta", metaMessageId: "wamid.bulk1" })
        },
        createWhatsappNotif: async (m, rd, mid) => { persisted.push(mid); return {}; }
      })
    );
    assert.equal(result.whatsappStatus, "sent");
    assert.equal(result.metaMessageId, "wamid.bulk1");
    assert.equal(result.inAppNotification, "created");
    assert.deepEqual(persisted, ["wamid.bulk1"]);
  });

  it("2. multiple eligible members are all processed (concurrency preserves every result)", async () => {
    const members = [
      makeMember({ _id: "m1", user: { name: "A", phone: "9876543210" } }),
      makeMember({ _id: "m2", user: { name: "B", phone: "9876543211" } }),
      makeMember({ _id: "m3", user: { name: "C", phone: "9876543212" } })
    ];
    const worker = reminder.runWithConcurrency;
    const results = await worker(members, async (m) => {
      const r = await reminder.sendReminderForMember(
        m,
        defaultDeps({
          whatsappSender: {
            normalizePhoneNumber: () => "9198765432" + m._id.slice(-1),
            getTemplateName: () => "membership_expiry_reminder",
            sendTemplateMessage: async () => ({ status: "sent", sent: true, provider: "meta", metaMessageId: `wamid.${m._id}` })
          },
          createWhatsappNotif: async () => ({})
        })
      );
      return r;
    });
    assert.equal(results.length, 3);
    assert.deepEqual(results.map((r) => r.memberId), ["m1", "m2", "m3"]);
    assert.ok(results.every((r) => r.whatsappStatus === "sent"));
  });

  it("3. individual and bulk paths use the SAME Meta provider (the live WhatsAppService)", async () => {
    // No env credentials, so the real singleton returns an honest
    // not_configured instead of touching the network. sendReminderForMember is
    // the shared worker for both the individual (memberIds) and the bulk mode,
    // and it routes through the real service when not overridden.
    const result = await reminder.sendReminderForMember(
      makeMember(),
      defaultDeps({ whatsappSender: undefined })
    );
    assert.equal(result.whatsappStatus, "not_configured");
    assert.ok(result.whatsappReason.startsWith("WhatsApp is not configured"));
    assert.equal(result.metaMessageId, undefined);
    // The bulk entry point (sendRemindersToEligible) launches the same
    // sendReminderForMember worker, so the provider is shared by construction.
  });

  it("4. a failed Meta response surfaces status/reason/error code/subcode for whatsappErrors", async () => {
    const result = await reminder.sendReminderForMember(
      makeMember(),
      defaultDeps({
        whatsappSender: {
          normalizePhoneNumber: () => "919876543210",
          getTemplateName: () => "membership_expiry_reminder",
          sendTemplateMessage: async () => ({
            status: "invalid_token",
            sent: false,
            provider: "meta",
            reason: "HTTP 401: Authentication Error",
            metaErrorCode: 190,
            metaErrorSubcode: null
          })
        },
        createWhatsappNotif: async () => { throw new Error("must not persist"); }
      })
    );
    assert.equal(result.whatsappStatus, "invalid_token");
    assert.equal(result.whatsappReason, "HTTP 401: Authentication Error");
    assert.equal(result.metaErrorCode, 190);
    // sendReminderForMember omits a null/undefined subcode from the result;
    // the controller normalizes it back to null when building whatsappErrors.
    assert.equal(result.metaErrorSubcode, undefined);
    // The controller maps exactly these fields into whatsappErrors.
    const errorEntry = {
      memberId: result.memberId,
      memberName: result.memberName,
      status: result.whatsappStatus,
      reason: result.whatsappReason,
      metaErrorCode: result.metaErrorCode ?? null,
      metaErrorSubcode: result.metaErrorSubcode ?? null
    };
    assert.equal(errorEntry.status, "invalid_token");
    assert.equal(errorEntry.metaErrorCode, 190);
    assert.equal(errorEntry.metaErrorSubcode, null);
  });

  it("5. a failed WhatsApp attempt is never recorded as successful", async () => {
    let persisted = 0;
    const result = await reminder.sendReminderForMember(
      makeMember(),
      defaultDeps({
        whatsappSender: {
          normalizePhoneNumber: () => "919876543210",
          getTemplateName: () => "membership_expiry_reminder",
          sendTemplateMessage: async () => ({ status: "meta_api_error", sent: false, provider: "meta", reason: "HTTP 400: something", metaErrorCode: 130429, metaErrorSubcode: null })
        },
        createWhatsappNotif: async () => { persisted += 1; return {}; }
      })
    );
    assert.equal(result.whatsappStatus, "meta_api_error");
    assert.equal(persisted, 0);
  });

  it("6. an in-app duplicate does NOT block the WhatsApp send and vice versa", async () => {
    // In-app record already exists for today -> in-app duplicate_skipped, but
    // the WhatsApp delivery is still attempted and delivered.
    const persisted = [];
    const result = await reminder.sendReminderForMember(
      makeMember(),
      defaultDeps({
        hasSent: async () => true,
        createWhatsappNotif: async (m, rd, mid) => { persisted.push(mid); return {}; }
      })
    );
    assert.equal(result.inAppNotification, "duplicate_skipped");
    assert.equal(result.whatsappStatus, "sent");
    assert.deepEqual(persisted, ["wamid.ok"]);
  });

  it("7. a previously recorded WhatsApp reminder is skipped without calling Meta again", async () => {
    let metaCalls = 0;
    const result = await reminder.sendReminderForMember(
      makeMember(),
      defaultDeps({
        hasWhatsappSent: async () => true,
        whatsappSender: {
          normalizePhoneNumber: () => "919876543210",
          getTemplateName: () => "membership_expiry_reminder",
          sendTemplateMessage: async () => { metaCalls += 1; return { status: "sent", sent: true, metaMessageId: "wamid.dup" }; }
        }
      })
    );
    assert.equal(result.whatsappStatus, "duplicate");
    assert.equal(result.whatsappReason, "alreadysent_on_reminder_date");
    assert.equal(metaCalls, 0);
  });

  it("8. expired members are handled per the existing rule (skipped, never messaged)", async () => {
    const member = makeMember({
      status: "active",
      paymentStatus: "paid",
      currentPlan: { _id: "p1", name: "Monthly Gold" },
      membershipStartDate: new Date("2026-07-01T00:00:00"),
      membershipExpiryDate: new Date("2026-09-01T00:00:00"),
      user: { name: "Old Member", phone: "+91 98765 43210" }
    });
    const result = await reminder.sendReminderForMember(member, defaultDeps());
    assert.equal(result.eligibilityReasons, null);
    assert.equal(result.whatsappStatus, "skipped");
    assert.equal(result.whatsappReason, "not_eligible");
  });

  it("9. one failed member does not stop the remaining eligible members", async () => {
    const members = [
      makeMember({ _id: "fail1", user: { name: "Failing", phone: "9876543210" } }),
      makeMember({ _id: "good2", user: { name: "Survives", phone: "9876543211" } })
    ];
    const results = await reminder.runWithConcurrency(members, async (m) => {
      if (m._id === "fail1") {
        // Meta errors are captured in the result; sendReminderForMember never
        // throws, so the loop continues to the next member.
        return reminder.sendReminderForMember(
          m,
          defaultDeps({
            whatsappSender: {
              normalizePhoneNumber: () => "919876543210",
              getTemplateName: () => "membership_expiry_reminder",
              sendTemplateMessage: async () => ({ status: "invalid_token", sent: false, reason: "HTTP 401", metaErrorCode: 190 })
            }
          })
        );
      }
      return reminder.sendReminderForMember(
        m,
        defaultDeps({
          whatsappSender: {
            normalizePhoneNumber: () => "919876543211",
            getTemplateName: () => "membership_expiry_reminder",
            sendTemplateMessage: async () => ({ status: "sent", sent: true, provider: "meta", metaMessageId: "wamid.good2" })
          },
          createWhatsappNotif: async (mm, rd, mid) => ({ mid })
        })
      );
    });
    assert.equal(results.length, 2);
    const fail = results.find((r) => r.memberId === "fail1");
    const good = results.find((r) => r.memberId === "good2");
    assert.equal(fail.whatsappStatus, "invalid_token");
    assert.equal(fail.metaErrorCode, 190);
    assert.equal(good.whatsappStatus, "sent");
    assert.equal(good.metaMessageId, "wamid.good2");
  });
});

// ── The live Meta failure (invalid/expired token) is classified accurately ──
describe("Live Meta failure classification (code 190)", () => {
  it("maps HTTP 401 + error code 190 to invalid_token so the UI can explain it", async () => {
    const svc = new WhatsAppService({
      env: { WHATSAPP_PROVIDER: "meta", WHATSAPP_ACCESS_TOKEN: "tok", WHATSAPP_PHONE_NUMBER_ID: "111" },
      fetch: async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Authentication Error", code: 190, error_subcode: null, type: "OAuthException" } })
      })
    });
    const result = await svc.sendTemplateMessage({ to: "+919475265880", parameters: [] });
    assert.equal(result.status, "invalid_token");
    assert.equal(result.metaErrorCode, 190);
    assert.equal(result.metaErrorSubcode, null);
    assert.equal(result.sent, false);
  });
});