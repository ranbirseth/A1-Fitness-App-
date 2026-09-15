const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const { WhatsAppService } = require("../services/whatsapp.service");

// The WhatsApp config lives in server/.env (gitignored). This test validates
// that the FILE the server actually loads (server.js dotsenv path) produces a
// "configured" Meta provider. It is skipped when the file is absent so a fresh
// clone (or CI) never fails because credentials were never committed.
const ENV_FILE = path.join(__dirname, "..", ".env");
const HAS_ENV_FILE = fs.existsSync(ENV_FILE);

describe("real server/.env WhatsApp configuration", { skip: HAS_ENV_FILE ? false : "server/.env not present in this checkout" }, () => {
  it("is loaded and detected as a configured Meta provider (booleans only, no values)", () => {
    dotenv.config({ path: ENV_FILE });
    const svc = new WhatsAppService({ env: process.env });
    const cfg = svc.getSafeConfig();

    assert.equal(cfg.provider, "meta");
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.hasAccessToken, true);
    assert.equal(cfg.hasPhoneNumberId, true);
    assert.equal(cfg.configured, true);
    assert.ok(String(cfg.templateName || "").length > 0, "template name should be configured");
    assert.ok(/^v\d/.test(cfg.apiVersion || ""), `expected versioned API like v21.0, got ${cfg.apiVersion}`);

    // The snapshot must contain ONLY booleans for credentials - the real access
    // token value must never exist as a field in the response.
    const snapshotKeys = Object.keys(cfg);
    assert.ok(!snapshotKeys.includes("accessToken"), "snapshot must not carry an accessToken field");
    assert.ok(!snapshotKeys.includes("WHATSAPP_ACCESS_TOKEN"), "snapshot must not carry the raw env key");
    assert.equal(typeof cfg.hasAccessToken, "boolean");
  });
});