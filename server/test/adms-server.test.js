const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

const Scanner = require("../models/scanner.model");
const Member = require("../models/member.model");
const Attendance = require("../models/attendance.model");
const ScannerEvent = require("../models/scannerEvent.model");
const DeviceCommand = require("../models/deviceCommand.model");
const { createAdmsServer, startAdmsServer } = require("../adms/admsServer");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const makeScanner = (overrides = {}) => ({
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
  },
  ...overrides
});

let server;
let baseUrl;
let store;

async function withServer(fn) {
  server = createAdmsServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

before(() => {
  store = { scanners: [], events: [], attendances: [], membersByUserId: {}, commands: [] };

  Scanner.findOne = async (query) => store.scanners.find((s) => s.serial === query.serial) || null;

  Member.findOne = async (query) => store.membersByUserId[query["biometrics.deviceUserId"]] || null;

  Attendance.findOne = async (query) =>
    store.attendances.find((a) => a.member === query.member && a.date === query.date && !a.deletedAt) || null;

  Attendance.create = async (doc) => {
    const rec = { ...doc, _id: "att-" + store.attendances.length, save: async function () {} };
    store.attendances.push(rec);
    return rec;
  };

  ScannerEvent.findOne = async ({ deviceEventId }) =>
    store.events.find((e) => e.deviceEventId === deviceEventId) || null;

  ScannerEvent.create = async (doc) => {
    const rec = { ...doc, _id: "evt-" + store.events.length };
    store.events.push(rec);
    return rec;
  };

  DeviceCommand.getNextCommandId = async () => 1;
  DeviceCommand.create = async (doc) => {
    const rec = { ...doc, _id: "cmd-" + store.commands.length };
    store.commands.push(rec);
    return rec;
  };
  const chainable = {
    sort() {
      return chainable;
    },
    select() {
      return chainable;
    },
    lean() {
      return chainable;
    },
    then(onOk, onError) {
      return Promise.resolve(null).then(onOk, onError);
    }
  };
  DeviceCommand.findOne = () => chainable;
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

describe("ADMS endpoint: GET /iclock/getrequest", () => {
  it("accepts a registered scanner and returns a keep-alive line", async () => {
    await withServer(async () => {
      store.scanners = [makeScanner()];
      const res = await fetch(`${baseUrl}/iclock/getrequest?SN=SN-001&options=all`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type"), /text\/plain/);
      assert.equal(await res.text(), "\n");
    });
  });

  it("handles the ZKTeco SN;options query form", async () => {
    await withServer(async () => {
      store.scanners = [makeScanner()];
      const res = await fetch(`${baseUrl}/iclock/getrequest?SN=SN-001;options=o%2Cthigh`);
      assert.equal(res.status, 200);
    });
  });

  it("updates scanner.lastSeen on a valid poll", async () => {
    await withServer(async () => {
      store.scanners = [makeScanner()];
      await fetch(`${baseUrl}/iclock/getrequest?SN=SN-001`);
      assert.ok(store.scanners[0].lastSeen instanceof Date);
    });
  });

  it("rejects an unknown serial with 404", async () => {
    await withServer(async () => {
      store.scanners = [makeScanner()];
      const res = await fetch(`${baseUrl}/iclock/getrequest?SN=NOPE`);
      assert.equal(res.status, 404);
    });
  });

  it("rejects a missing SN with 400", async () => {
    await withServer(async () => {
      store.scanners = [makeScanner()];
      const res = await fetch(`${baseUrl}/iclock/getrequest`);
      assert.equal(res.status, 400);
    });
  });

  it("rejects a disabled scanner with 403", async () => {
    await withServer(async () => {
      store.scanners = [makeScanner({ serial: "SN-DIS", status: "disabled" })];
      const res = await fetch(`${baseUrl}/iclock/getrequest?SN=SN-DIS`);
      assert.equal(res.status, 403);
    });
  });
});

describe("ADMS endpoint: POST /iclock/cdata", () => {
  it("rejects an unknown scanner", async () => {
    await withServer(async () => {
      store.scanners = [makeScanner()];
      const res = await fetch(`${baseUrl}/iclock/cdata?SN=NOPE&table=ATTLOG`, {
        method: "POST",
        body: "1001,2026-09-20 08:05:12,1,0,0,0,1"
      });
      assert.equal(res.status, 404);
    });
  });

  it("rejects a disabled scanner", async () => {
    await withServer(async () => {
      store.scanners = [makeScanner({ serial: "SN-DIS", status: "disabled" })];
      const res = await fetch(`${baseUrl}/iclock/cdata?SN=SN-DIS&table=ATTLOG`, {
        method: "POST",
        body: "x"
      });
      assert.equal(res.status, 403);
    });
  });

  it("returns OK for non-ATTLOG tables without creating attendance", async () => {
    await withServer(async () => {
      store.scanners = [makeScanner()];
      store.attendances = [];
      const res = await fetch(`${baseUrl}/iclock/cdata?SN=SN-001&table=OPERLOG`, {
        method: "POST",
        body: "some,oplog,record"
      });
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "OK");
      assert.equal(store.attendances.length, 0);
    });
  });

  it("reaches processScannerEvent for a valid ATTLOG record", async () => {
    await withServer(async () => {
      store.scanners = [makeScanner()];
      store.attendances = [];
      store.events = [];
      store.membersByUserId["1001"] = {
        _id: "m-1001",
        user: "u-1001",
        status: "active",
        paymentStatus: "paid",
        membershipExpiryDate: new Date(Date.now() + 30 * 86400000),
        branchCode: "MAIN",
        biometrics: { deviceUserId: "1001" }
      };
      const res = await fetch(`${baseUrl}/iclock/cdata?SN=SN-001&table=ATTLOG`, {
        method: "POST",
        body: "1001,2026-09-20 08:05:12,1,0,0,0,1"
      });
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "OK: 1");
      assert.equal(store.attendances.length, 1);
      assert.equal(store.attendances[0].member, "m-1001");
      assert.equal(store.attendances[0].source, "scanner");
    });
  });

  it("accepts GET /iclock/cdata.aspx and answers a keep-alive OK line for an empty body", async () => {
    await withServer(async () => {
      store.scanners = [makeScanner()];
      store.attendances = [];
      const res = await fetch(`${baseUrl}/iclock/cdata.aspx?SN=SN-001&table=ATTLOG`);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "OK\n");
      assert.equal(store.attendances.length, 0);
    });
  });

  it("parses ATTLOG data passed in the query string for a GET push", async () => {
    await withServer(async () => {
      store.scanners = [makeScanner()];
      store.attendances = [];
      store.events = [];
      store.membersByUserId["1001"] = {
        _id: "m-1001",
        user: "u-1001",
        status: "active",
        paymentStatus: "paid",
        membershipExpiryDate: new Date(Date.now() + 30 * 86400000),
        branchCode: "MAIN",
        biometrics: { deviceUserId: "1001" }
      };
      const data = encodeURIComponent("1001,2026-09-20 08:05:12,1,0,0,0,1");
      const res = await fetch(`${baseUrl}/iclock/cdata?SN=SN-001&table=ATTLOG&data=${data}`);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "OK: 1");
      assert.equal(store.attendances.length, 1);
      assert.equal(store.attendances[0].member, "m-1001");
    });
  });

  it("returns 404 for unknown paths", async () => {
    await withServer(async () => {
      const res = await fetch(`${baseUrl}/iclock/devicecmd`, { method: "GET" });
      assert.equal(res.status, 404);
    });
  });
});

describe("ADMS server startup resilience", () => {
  it("absorbs a bind conflict (EADDRINUSE) without crashing the process", async () => {
    const adms = startAdmsServer();
    try {
      await delay(50);
      adms.emit(
        "error",
        Object.assign(new Error("listen EADDRINUSE: address already in use :::8081"), { code: "EADDRINUSE" })
      );
      await delay(20);
      assert.ok(adms instanceof http.Server);
      assert.ok(true, "process survived an EADDRINUSE event with no uncaught error");
    } finally {
      if (adms && adms.listening) {
        await new Promise((resolve) => adms.close(resolve));
      }
    }
  });
});