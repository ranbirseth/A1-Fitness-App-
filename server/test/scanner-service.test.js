const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const Member = require("../models/member.model");
const Attendance = require("../models/attendance.model");
const ScannerEvent = require("../models/scannerEvent.model");
const { processScannerEvent } = require("../services/scanner.service");

const DAY = 24 * 60 * 60 * 1000;

const store = { events: [], attendances: [], seq: 0 };
const membersByUserId = {};

const scanner = {
  _id: "s1",
  gymId: "MAIN",
  branchCode: "MAIN",
  deviceId: "K30-001",
  name: "Front Door",
  settings: { enforceMembership: true, enableCheckOutOnSecondScan: true }
};

const makeMember = (userId, overrides = {}) => ({
  _id: "m-" + userId,
  user: "u-" + userId,
  status: "active",
  paymentStatus: "paid",
  membershipExpiryDate: new Date(Date.now() + 30 * DAY),
  branchCode: "MAIN",
  biometrics: { deviceUserId: String(userId), cardId: "C" + userId, fingerprints: [] },
  ...overrides
});

const nextId = () => "id-" + store.seq++;

before(() => {
  store.events = [];
  store.attendances = [];
  store.seq = 0;
  for (const [userId, member] of Object.entries(membersByUserId)) {
    if (member) membersByUserId[userId];
  }

  Member.findOne = async (query) => {
    const key = query["biometrics.deviceUserId"];
    return membersByUserId[key] || null;
  };

  Attendance.findOne = async (query) =>
    store.attendances.find((a) => a.member === query.member && a.date === query.date && !a.deletedAt) || null;

  Attendance.create = async (doc) => {
    const rec = { ...doc, _id: nextId(), auditLogs: doc.auditLogs || [], save: async function () {} };
    store.attendances.push(rec);
    return rec;
  };

  ScannerEvent.findOne = async ({ deviceEventId }) =>
    store.events.find((e) => e.deviceEventId === deviceEventId) || null;

  ScannerEvent.create = async (doc) => {
    const rec = { ...doc, _id: nextId() };
    store.events.push(rec);
    return rec;
  };
});

after(() => {
  delete Member.findOne;
  delete Attendance.findOne;
  delete Attendance.create;
  delete ScannerEvent.findOne;
  delete ScannerEvent.create;
});

describe("scanner event processing (mocked store)", () => {
  it("allows a verified fingerprint for a known active member (check-in)", async () => {
    const member = makeMember("1001");
    membersByUserId["1001"] = member;
    const result = await processScannerEvent({
      scanner,
      event: { userId: "1001", eventType: "fingerprint", verified: true, deviceEventId: "evt-1a", timestamp: new Date("2026-09-12T02:30:00Z") }
    });
    assert.equal(result.status, "checkin");
    const att = store.attendances[0];
    assert.ok(att);
    assert.equal(att.source, "scanner");
    assert.equal(att.member, member._id);
    assert.equal(store.events.at(-1).decision, "allow");
    assert.equal(store.events.at(-1).reason, "verified");
  });

  it("marks a scan after 09:00 IST as late", async () => {
    const member = makeMember("1002");
    membersByUserId["1002"] = member;
    const result = await processScannerEvent({
      scanner,
      event: { userId: "1002", eventType: "fingerprint", verified: true, deviceEventId: "evt-2a", timestamp: new Date("2026-09-12T05:30:00Z") } // 11:00 IST
    });
    assert.equal(result.status, "checkin");
    assert.equal(store.attendances[1].status, "late");
  });

  it("second scan of the day performs a check-out (stays completed)", async () => {
    const member = makeMember("1001");
    membersByUserId["1001"] = member;
    const result = await processScannerEvent({
      scanner,
      event: { userId: "1001", eventType: "fingerprint", verified: true, deviceEventId: "evt-1b", timestamp: new Date("2026-09-12T11:30:00Z") }
    });
    assert.equal(result.status, "checkout");
    assert.equal(store.attendances[0].status, "completed");
    assert.ok(store.attendances[0].checkOut);
  });

  it("a third scan is idempotent (duplicate, no new attendance)", async () => {
    const beforeCount = store.attendances.length;
    const member = makeMember("1001");
    membersByUserId["1001"] = member;
    const result = await processScannerEvent({
      scanner,
      event: { userId: "1001", eventType: "fingerprint", verified: true, deviceEventId: "evt-1c", timestamp: new Date("2026-09-12T12:30:00Z") }
    });
    assert.equal(result.status, "duplicate");
    assert.equal(store.attendances.length, beforeCount);
    assert.equal(store.events.at(-1).reason, "duplicate");
  });

  it("rejects an unknown user id (unknown_user)", async () => {
    const result = await processScannerEvent({
      scanner,
      event: { userId: "9999", eventType: "fingerprint", verified: true, deviceEventId: "evt-3a", timestamp: new Date() }
    });
    assert.equal(result.status, "denied");
    assert.equal(result.reason, "unknown_user");
    assert.equal(store.events.at(-1).reason, "unknown_user");
  });

  it("rejects a verified scan for an expired member (expired)", async () => {
    const expired = makeMember("1003", { membershipExpiryDate: new Date(Date.now() - DAY) });
    membersByUserId["1003"] = expired;
    const result = await processScannerEvent({
      scanner,
      event: { userId: "1003", eventType: "fingerprint", verified: true, deviceEventId: "evt-4a", timestamp: new Date() }
    });
    assert.equal(result.status, "denied");
    assert.equal(result.reason, "expired");
  });

  it("rejects a rejected scan event (not_matched)", async () => {
    const member = makeMember("1001");
    membersByUserId["1001"] = member;
    const result = await processScannerEvent({
      scanner,
      event: { userId: "1001", eventType: "fingerprint", verified: false, deviceEventId: "evt-5a", timestamp: new Date() }
    });
    assert.equal(result.status, "denied");
    assert.equal(result.reason, "not_matched");
  });

  it("dedupes repeated device events by deviceEventId", async () => {
    const member = makeMember("1004");
    membersByUserId["1004"] = member;
    const event = { userId: "1004", eventType: "fingerprint", verified: true, deviceEventId: "evt-6a", timestamp: new Date("2026-09-12T01:00:00Z") };
    const first = await processScannerEvent({ scanner, event });
    const second = await processScannerEvent({ scanner, event });
    assert.equal(first.status, "checkin");
    assert.equal(second.status, "duplicate");
    assert.equal(store.events.filter((e) => e.deviceEventId === "evt-6a").length, 1);
  });
});