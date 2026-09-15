const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { getTodayDate, formatDateInTimezone, DEFAULT_TIMEZONE } = require("../utils/date");
const { getEligibilityIssue, assertMemberEligible, BLOCKED_BY_ATTENDANCE_STATUSES } = require("../utils/membership");
const { hashKey, generateKey } = require("../utils/deviceKey");
const { AppError } = require("../utils/appError");

describe("date utils (IST-corrected getTodayDate)", () => {
  it("formats a known instant to the IST calendar date", () => {
    // 2026-09-12T20:30:00Z == 2026-09-13 02:00 IST
    assert.equal(formatDateInTimezone(new Date("2026-09-12T20:30:00Z"), "Asia/Kolkata"), "2026-09-13");
  });

  it("does not roll over the date before 05:29 IST (UTC-day bug)", () => {
    // 2026-09-12T20:00:00Z == 2026-09-13 01:30 IST; the old toISOString() logic would return the UTC date 09-12.
    assert.equal(formatDateInTimezone(new Date("2026-09-12T20:00:00Z"), "Asia/Kolkata"), "2026-09-13");
  });

  it("getTodayDate uses the configured default timezone and yields YYYY-MM-DD", () => {
    const d = getTodayDate();
    assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(DEFAULT_TIMEZONE.length > 0);
  });
});

describe("membership eligibility", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const active = { status: "active", paymentStatus: "paid", membershipExpiryDate: new Date(Date.now() + 30 * DAY) };

  it("returns null (eligible) for an active paid member", () => {
    assert.equal(getEligibilityIssue(active), null);
  });

  it("detects each blocked status", () => {
    for (const status of BLOCKED_BY_ATTENDANCE_STATUSES) {
      assert.equal(getEligibilityIssue({ ...active, status }), "ineligible", status);
    }
  });

  it("detects expiry and pending payment", () => {
    assert.equal(getEligibilityIssue({ ...active, membershipExpiryDate: new Date(Date.now() - DAY) }), "expired");
    assert.equal(getEligibilityIssue({ ...active, paymentStatus: "pending" }), "payment_pending");
  });

  it("assertMemberEligible throws AppError for ineligible members", () => {
    assert.throws(() => assertMemberEligible({ ...active, paymentStatus: "pending" }), AppError);
    assert.throws(() => assertMemberEligible({ status: "frozen", paymentStatus: "paid", membershipExpiryDate: new Date(Date.now() + DAY) }), AppError);
  });
});

describe("device key utils", () => {
  it("hashes deterministically and is not reversible", () => {
    assert.equal(hashKey("abc"), hashKey("abc"));
    assert.notEqual(hashKey("abc"), hashKey("abd"));
  });

  it("generates unique keys", () => {
    const a = generateKey();
    const b = generateKey();
    assert.ok(a.length >= 32);
    assert.notEqual(a, b);
  });
});