const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseAttLog,
  toScannerEvent,
  mapVerifyTypeToEventType,
  parseAdmsDateTime
} = require("../utils/admsParser");

describe("admsParser: parseAdmsDateTime", () => {
  it("parses an ATTLOG wall-clock timestamp", () => {
    const d = parseAdmsDateTime("2026-09-20 08:05:12");
    assert.equal(d.toISOString(), "2026-09-20T02:35:12.000Z");
  });

  it("accepts a T separator", () => {
    const d = parseAdmsDateTime("2026-09-20T08:05:12");
    assert.equal(d.toISOString(), "2026-09-20T02:35:12.000Z");
  });

  it("returns null for malformed timestamps", () => {
    assert.equal(parseAdmsDateTime("not-a-date"), null);
    assert.equal(parseAdmsDateTime(""), null);
    assert.equal(parseAdmsDateTime(undefined), null);
  });
});

describe("admsParser: mapVerifyTypeToEventType", () => {
  it("maps 1->fingerprint, 2->card, 3->pin, 4->face", () => {
    assert.equal(mapVerifyTypeToEventType("1"), "fingerprint");
    assert.equal(mapVerifyTypeToEventType("2"), "card");
    assert.equal(mapVerifyTypeToEventType("3"), "pin");
    assert.equal(mapVerifyTypeToEventType("4"), "face");
  });

  it("falls back safely to fingerprint for unknown verification values", () => {
    assert.equal(mapVerifyTypeToEventType("15"), "fingerprint");
    assert.equal(mapVerifyTypeToEventType(""), "fingerprint");
    assert.equal(mapVerifyTypeToEventType(undefined), "fingerprint");
  });
});

describe("admsParser: parseAttLog", () => {
  it("parses a valid fingerprint record", () => {
    const records = parseAttLog("1001,2026-09-20 08:05:12,1,0,0,0,1");
    assert.equal(records.length, 1);
    const r = records[0];
    assert.equal(r.malformed, undefined);
    assert.equal(r.userId, "1001");
    assert.equal(r.verifyType, "1");
    assert.equal(r.attState, "0");
    assert.equal(r.verifyResult, "0");
    assert.equal(r.workCode, "0");
    assert.equal(r.reserved, "1");
    assert.equal(r.raw, "1001,2026-09-20 08:05:12,1,0,0,0,1");
    assert.equal(r.timestamp.toISOString(), "2026-09-20T02:35:12.000Z");
  });

  it("parses a valid card record", () => {
    const records = parseAttLog("9001,2026-09-20 09:30:00,2,1,0,0,0");
    assert.equal(records.length, 1);
    assert.equal(records[0].userId, "9001");
    assert.equal(records[0].verifyType, "2");
    assert.equal(records[0].attState, "1");
  });

  it("parses multiple records and skips blank lines", () => {
    const records = parseAttLog("1001,2026-09-20 08:05:12,1,0,0,0,1\n\n1001,2026-09-20 12:05:12,1,1,0,0,1\n");
    assert.equal(records.length, 2);
  });

  it("parses tab-separated hardware stream layouts", () => {
    const records = parseAttLog("1001\t2026-09-20 08:05:12\t1\t0\t0\t0\t1\n");
    assert.equal(records.length, 1);
    const r = records[0];
    assert.equal(r.malformed, undefined);
    assert.equal(r.userId, "1001");
    assert.equal(r.verifyType, "1");
    assert.equal(r.attState, "0");
    assert.equal(r.verifyResult, "0");
    assert.equal(r.workCode, "0");
    assert.equal(r.reserved, "1");
    assert.equal(r.timestamp.toISOString(), "2026-09-20T02:35:12.000Z");
  });

  it("tolerates records with optional trailing fields", () => {
    const records = parseAttLog("1001,2026-09-20 08:05:12,1\n");
    assert.equal(records.length, 1);
    const r = records[0];
    assert.equal(r.malformed, undefined);
    assert.equal(r.verifyResult, undefined);
    assert.equal(r.workCode, undefined);
    assert.equal(r.reserved, undefined);
  });

  it("marks malformed records instead of crashing", () => {
    const records = parseAttLog("garbage line,,,\n1001,2026-09-20 08:05:12,1,0,0,0,1\nnot-a-date,x,1,0,0,0,0\n");
    assert.equal(records.length, 3);
    const malformed = records.filter((r) => r.malformed);
    assert.equal(malformed.length, 2);
    assert.equal(malformed[0].raw, "garbage line,,,");
    assert.equal(malformed[1].raw, "not-a-date,x,1,0,0,0,0");
    assert.equal(records[1].malformed, undefined);
  });
});

describe("admsParser: toScannerEvent", () => {
  const scanner = { serial: "SN-001", deviceId: "K30-001" };

  it("produces the processScannerEvent-compatible shape", () => {
    const record = parseAttLog("1001,2026-09-20 08:05:12,1,0,0,0,1")[0];
    const event = toScannerEvent(record, scanner);
    assert.equal(event.userId, "1001");
    assert.equal(event.eventType, "fingerprint");
    assert.equal(event.verified, true);
    assert.ok(event.timestamp instanceof Date);
    const expected = `SN-001:1001:${new Date("2026-09-20T02:35:12.000Z").getTime()}:0:1:0`;
    assert.equal(event.deviceEventId, expected);
    assert.equal(event.cardId, undefined);
  });

  it("maps card verify type plus cardId", () => {
    const record = parseAttLog("9001,2026-09-20 09:30:00,2,1,0,0,0")[0];
    const event = toScannerEvent(record, scanner);
    assert.equal(event.eventType, "card");
    assert.equal(event.cardId, "9001");
  });

  it("is deterministic for the same device transaction", () => {
    const a = toScannerEvent(parseAttLog("1001,2026-09-20 08:05:12,1,0,0,0,1")[0], scanner);
    const b = toScannerEvent(parseAttLog("1001,2026-09-20 08:05:12,1,0,0,0,1")[0], scanner);
    assert.equal(a.deviceEventId, b.deviceEventId);
  });

  it("returns null for malformed/missing records", () => {
    assert.equal(toScannerEvent({ malformed: true, raw: "x" }, scanner), null);
    assert.equal(toScannerEvent(null, scanner), null);
  });
});