const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const Scanner = require("../models/scanner.model");
const Member = require("../models/member.model");
const Attendance = require("../models/attendance.model");
const ScannerEvent = require("../models/scannerEvent.model");
const DeviceCommand = require("../models/deviceCommand.model");
const { handleCdata } = require("../controllers/adms.controller");

const DAY = 24 * 60 * 60 * 1000;

const scanner = {
  _id: "s1",
  gymId: "MAIN",
  branchCode: "MAIN",
  deviceId: "K30-001",
  serial: "SN-001",
  name: "Front Door",
  status: "online",
  settings: { enforceMembership: true, enableCheckOutOnSecondScan: true },
  save: async function () {
    return this;
  }
};

let store;
let membersByUserId;

function makeMember(userId, overrides = {}) {
  return {
    _id: "m-" + userId,
    user: "u-" + userId,
    status: "active",
    paymentStatus: "paid",
    membershipExpiryDate: new Date(Date.now() + 30 * DAY),
    branchCode: "MAIN",
    biometrics: { deviceUserId: String(userId), cardId: "C" + userId },
    ...overrides
  };
}

function cdata(body) {
  const url = new URL("http://localhost/iclock/cdata?SN=SN-001&table=ATTLOG");
  const res = {
    statusCode: null,
    headers: {},
    body: "",
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(t) {
      this.body = t;
    }
  };
  return handleCdata(null, res, url, body).then(() => ({ statusCode: res.statusCode, body: res.body }));
}

before(() => {
  store = { events: [], attendances: [], seq: 0, commands: [] };
  membersByUserId = {};

  Scanner.findOne = async (query) => (query.serial === "SN-001" ? scanner : null);

  Member.findOne = async (query) => {
    const key = query["biometrics.deviceUserId"];
    return membersByUserId[key] || null;
  };

  Attendance.findOne = async (query) =>
    store.attendances.find((a) => a.member === query.member && a.date === query.date && !a.deletedAt) || null;

  Attendance.create = async (doc) => {
    const rec = { ...doc, _id: "att-" + store.seq++, save: async function () {} };
    store.attendances.push(rec);
    return rec;
  };

  ScannerEvent.findOne = async ({ deviceEventId }) =>
    store.events.find((e) => e.deviceEventId === deviceEventId) || null;

  ScannerEvent.create = async (doc) => {
    const rec = { ...doc, _id: "evt-" + store.seq++ };
    store.events.push(rec);
    return rec;
  };

  DeviceCommand.getNextCommandId = async () => 1;
  DeviceCommand.create = async (doc) => {
    const rec = { ...doc, _id: "cmd-" + store.seq++ };
    store.commands.push(rec);
    return rec;
  };
  DeviceCommand.findOne = async () => null;
});

after(() => {
  delete Scanner.findOne;
  delete Member.findOne;
  delete Attendance.findOne;
  delete Attendance.create;
  delete ScannerEvent.findOne;
  delete ScannerEvent.create;
  delete DeviceCommand.findOne;
  delete DeviceCommand.create;
  delete DeviceCommand.getNextCommandId;
});

function reset() {
  store.events = [];
  store.attendances = [];
  store.commands = [];
  store.seq = 0;
  membersByUserId = {};
}

describe("ADMS integration through handleCdata -> processScannerEvent", () => {
  it("valid member fingerprint -> check-in (present)", async () => {
    reset();
    membersByUserId["1001"] = makeMember("1001");
    const { statusCode, body } = await cdata("1001,2026-09-20 08:05:12,1,0,0,0,1");
    assert.equal(statusCode, 200);
    assert.equal(body, "OK: 1");
    assert.equal(store.attendances.length, 1);
    const att = store.attendances[0];
    assert.equal(att.member, "m-1001");
    assert.equal(att.source, "scanner");
    assert.equal(att.status, "present");
    assert.equal(att.date, "2026-09-20");
  });

  it("second scan same day -> checkout, status completed", async () => {
    reset();
    membersByUserId["1001"] = makeMember("1001");
    await cdata("1001,2026-09-20 08:05:12,1,0,0,0,1");
    const { body } = await cdata("1001,2026-09-20 12:05:12,1,1,0,0,1");
    assert.equal(body, "OK: 1");
    assert.equal(store.attendances.length, 1);
    const att = store.attendances[0];
    assert.ok(att.checkOut instanceof Date);
    assert.equal(att.status, "completed");
    assert.ok(store.events.some((e) => e.reason === "checkout"));
  });

  it("third scan same day -> duplicate, no new attendance", async () => {
    reset();
    membersByUserId["1001"] = makeMember("1001");
    await cdata("1001,2026-09-20 08:05:12,1,0,0,0,1");
    await cdata("1001,2026-09-20 12:05:12,1,1,0,0,1");
    const { body } = await cdata("1001,2026-09-20 13:00:00,1,1,0,0,1");
    assert.equal(body, "OK: 1");
    assert.equal(store.attendances.length, 1);
    assert.ok(store.events.some((e) => e.reason === "duplicate"));
  });

  it("expired member -> denied expired, no attendance, gate command queued", async () => {
    reset();
    membersByUserId["3001"] = makeMember("3001", { membershipExpiryDate: new Date(Date.now() - DAY) });
    const { body } = await cdata("3001,2026-09-20 08:05:12,1,0,0,0,1");
    assert.equal(body, "OK: 1");
    assert.equal(store.attendances.length, 0);
    assert.ok(store.events.some((e) => e.decision === "deny" && e.reason === "expired"));
    assert.equal(store.commands.length, 1);
    assert.match(store.commands[0].commandString, /^DATA UPDATE OPTIONS AccessRuleType=0/);
    assert.equal(store.commands[0].serialNumber, "SN-001");
  });

  it("unknown user -> denied unknown_user", async () => {
    reset();
    const { body } = await cdata("9999,2026-09-20 08:05:12,1,0,0,0,1");
    assert.equal(body, "OK: 1");
    assert.equal(store.attendances.length, 0);
    assert.ok(store.events.some((e) => e.decision === "deny" && e.reason === "unknown_user"));
  });

  it("cross-branch member -> denied branch_mismatch, no attendance", async () => {
    reset();
    membersByUserId["2001"] = makeMember("2001", { branchCode: "BR02" });
    const { body } = await cdata("2001,2026-09-20 08:05:12,1,0,0,0,1");
    assert.equal(body, "OK: 1");
    assert.equal(store.attendances.length, 0);
    assert.ok(store.events.some((e) => e.decision === "deny" && e.reason === "branch_mismatch"));
  });

  it("duplicate deviceEventId (resend) -> duplicate, one attendance", async () => {
    reset();
    membersByUserId["1001"] = makeMember("1001");
    const line = "1001,2026-09-20 08:05:12,1,0,0,0,1";
    await cdata(line);
    await cdata(line);
    assert.equal(store.attendances.length, 1);
    assert.equal(store.events.length, 1);
  });

  it("card record -> eventType card and checks in card member", async () => {
    reset();
    membersByUserId["9001"] = makeMember("9001", { biometrics: { deviceUserId: "9001", cardId: "9001" } });
    const { body } = await cdata("9001,2026-09-20 08:05:12,2,0,0,0,0");
    assert.equal(body, "OK: 1");
    assert.equal(store.attendances.length, 1);
    assert.equal(store.attendances[0].eventType, "card");
    assert.ok(store.events.some((e) => e.eventType === "card"));
  });

  it("handles a URL-encoded form-wrapped ATTLOG payload (data= key)", async () => {
    reset();
    membersByUserId["1001"] = makeMember("1001");
    const wrapped = "table=ATTLOG&data=" + encodeURIComponent("1001,2026-09-20 08:05:12,1,0,0,0,1");
    const { statusCode, body } = await cdata(wrapped);
    assert.equal(statusCode, 200);
    assert.equal(body, "OK: 1");
    assert.equal(store.attendances.length, 1);
    assert.equal(store.attendances[0].member, "m-1001");
    assert.equal(store.attendances[0].source, "scanner");
  });

  it("blank body falls back to query-string data (GET push)", async () => {
    reset();
    membersByUserId["1001"] = makeMember("1001");
    const url = new URL(
      "http://localhost/iclock/cdata?SN=SN-001&table=ATTLOG&data=" +
        encodeURIComponent("1001,2026-09-20 08:05:12,1,0,0,0,1")
    );
    const res = {
      statusCode: null,
      headers: {},
      body: "",
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(t) {
        this.body = t;
      }
    };
    await handleCdata(null, res, url, "");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, "OK: 1");
    assert.equal(store.attendances.length, 1);
    assert.equal(store.attendances[0].member, "m-1001");
  });

  it("blank body with no query data returns a keep-alive OK line", async () => {
    reset();
    const { statusCode, body } = await cdata("");
    assert.equal(statusCode, 200);
    assert.equal(body, "OK\n");
    assert.equal(store.attendances.length, 0);
  });
});