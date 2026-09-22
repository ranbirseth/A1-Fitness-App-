const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const Scanner = require("../models/scanner.model");
const { findScannerBySerial, normalizeSerial } = require("../services/admsDeviceLookup");

let store;

before(() => {
  store = { scanners: [] };
  Scanner.findOne = async (query) => store.scanners.find((s) => s.serial === query.serial) || null;
});

after(() => {
  delete Scanner.findOne;
});

describe("admsDeviceLookup: normalizeSerial", () => {
  it("trims surrounding whitespace", () => {
    assert.equal(normalizeSerial("  SN-001  "), "SN-001");
  });

  it("is safe for empty/missing input", () => {
    assert.equal(normalizeSerial("   "), "");
    assert.equal(normalizeSerial(undefined), "");
    assert.equal(normalizeSerial(null), "");
  });

  it("stringifies non-string serials safely", () => {
    assert.equal(normalizeSerial(123), "123");
  });
});

describe("admsDeviceLookup: findScannerBySerial", () => {
  it("resolves a registered scanner by exact serial", async () => {
    store.scanners = [{ serial: "SN-001", deviceId: "K30-001" }];
    const scanner = await findScannerBySerial("SN-001");
    assert.ok(scanner);
    assert.equal(scanner.deviceId, "K30-001");
  });

  it("returns null for an unknown serial", async () => {
    store.scanners = [{ serial: "SN-001", deviceId: "K30-001" }];
    assert.equal(await findScannerBySerial("SN-999"), null);
  });

  it("matches with surrounding whitespace and case normalization", async () => {
    store.scanners = [{ serial: "SN-001", deviceId: "K30-001" }];
    const scanner = await findScannerBySerial("  sn-001  ");
    assert.ok(scanner);
    assert.equal(scanner.deviceId, "K30-001");
  });

  it("returns the disabled scanner document so the controller can reject it", async () => {
    store.scanners = [{ serial: "SN-002", deviceId: "K30-002", status: "disabled" }];
    const scanner = await findScannerBySerial("SN-002");
    assert.ok(scanner);
    assert.equal(scanner.status, "disabled");
  });
});