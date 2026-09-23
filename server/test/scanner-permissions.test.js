const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { authorize, adminOnly } = require("../middlewares/auth.middleware");
const Scanner = require("../models/scanner.model");
const Member = require("../models/member.model");
const {
  getScanners,
  createScanner,
  getScannerById,
  updateScanner,
  deleteScanner,
  rotateScannerKey,
  getSyncPayload,
} = require("../controllers/scanner.controller");

const FORBIDDEN = 403;

const callChain = async (mws, req) => {
  for (const mw of mws) {
    const err = await new Promise((resolve) => mw(req, {}, resolve));
    if (err) return err;
  }
  return null;
};

const chainOut = (err) => (err ? { ok: false, err } : { ok: true });

const runHandler = (handler, req) =>
  new Promise((resolve) => {
    const res = {
      statusCode: null,
      body: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.body = b;
        resolve({ ok: true, res: this });
      },
    };
    handler(req, res, (err) => resolve({ ok: false, err }));
  });

const makeQueryStub = (items) => {
  const q = {
    select: () => q,
    sort: () => q,
    populate: () => q,
    lean: () => q,
    then: (onFulfilled) => onFulfilled(items),
  };
  return q;
};

const saReq = (overrides = {}) => ({
  user: { role: "superadmin", _id: "u-sa", branchCode: undefined },
  gymId: "G1",
  params: { id: "s1" },
  body: {},
  query: {},
  ...overrides,
});

const adminReq = (overrides = {}) => ({
  user: { role: "admin", _id: "u-ad", branchCode: "MAIN" },
  gymId: "G1",
  params: { id: "s1" },
  body: {},
  query: {},
  ...overrides,
});

let store;
let lastFindQuery;
let createdDoc;

before(() => {
  store = { scanner: null, items: [] };
  lastFindQuery = null;
  createdDoc = null;

  Scanner.findOne = async (query) => {
    if (query.deviceId) return store.scannerByDeviceId?.get(query.deviceId) || null;
    return store.scanner;
  };

  Scanner.find = (query) => {
    lastFindQuery = query;
    return makeQueryStub(store.items);
  };

  Scanner.create = async (doc) => {
    createdDoc = doc;
    const obj = { ...doc, _id: "s1" };
    obj.toObject = () => ({ ...obj });
    return obj;
  };

  Member.find = () => makeQueryStub([]);
});

after(() => {
  delete Scanner.findOne;
  delete Scanner.find;
  delete Scanner.create;
  delete Member.find;
});

describe("superadmin is read-only on scanner endpoints", () => {
  it("the write guard (adminOnly) rejects superadmin with 403", async () => {
    const err = await callChain([authorize("admin", "superadmin"), adminOnly], saReq());
    assert.ok(err);
    assert.equal(err.statusCode, FORBIDDEN);
  });

  it("every mutation route rejects superadmin with 403", async () => {
    const mutations = [
      () => callChain([authorize("admin", "superadmin"), adminOnly], saReq()).then(chainOut),
      () => runHandler(createScanner, saReq()),
      () => runHandler(updateScanner, saReq()),
      () => runHandler(deleteScanner, saReq()),
      () => runHandler(rotateScannerKey, saReq()),
      () => runHandler(getSyncPayload, saReq()),
    ];
    for (const call of mutations) {
      const out = await call();
      assert.equal(out.ok, false, "expected a 403 error");
      assert.equal(out.err.statusCode, FORBIDDEN);
      assert.match(out.err.message, /Only branch admins/);
    }
  });

  it("superadmin can still list and read scanners (read-only works)", async () => {
    store.items = [{ _id: "s1", name: "Front Door", branchCode: "X1" }];
    store.scanner = store.items[0];
    const out = await runHandler(getScanners, saReq());
    assert.equal(out.ok, true);
    assert.equal(out.res.statusCode, 200);
    assert.equal(out.res.body.data.length, 1);
  });
});

describe("branch admins can manage their own branch", () => {
  it("list queries are scoped to the admin's branchCode", async () => {
    const req = adminReq({ user: { role: "admin", _id: "u-ad", branchCode: "B1" } });
    store.items = [{ _id: "s1", branchCode: "B1" }];
    store.scanner = store.items[0];
    const out = await runHandler(getScanners, req);
    assert.equal(out.ok, true);
    assert.equal(lastFindQuery.branchCode, "B1");
  });

  it("a cross-branch scanner is treated as not found (404)", async () => {
    store.scanner = { _id: "s1", branchCode: "OTHER" };
    const out = await runHandler(getScannerById, adminReq());
    assert.equal(out.ok, false);
    assert.equal(out.err.statusCode, 404);
  });

  it("an admin can create a scanner (201) in their own branch using an explicit branchCode", async () => {
    store.scanner = null;
    const req = adminReq({
      user: { role: "admin", _id: "u-ad", branchCode: "B1" },
      body: { name: "Front Door", deviceId: "K30-1", branchCode: "B1" },
    });
    const out = await runHandler(createScanner, req);
    assert.equal(out.ok, true);
    assert.equal(out.res.statusCode, 201);
    assert.equal(createdDoc.branchCode, "B1");
  });

  it("an admin cannot create a scanner for another branch", async () => {
    store.scanner = null;
    const req = adminReq({
      user: { role: "admin", _id: "u-ad", branchCode: "B1" },
      body: { name: "Back Door", deviceId: "K30-2", branchCode: "BOGUS" },
    });
    const out = await runHandler(createScanner, req);
    assert.equal(out.ok, false);
    assert.equal(out.err.statusCode, FORBIDDEN);
    assert.match(out.err.message, /Cannot assign a scanner to another branch/);
  });

  it("an admin without a branchCode request falls back to their own branch", async () => {
    store.scanner = null;
    const req = adminReq({
      user: { role: "admin", _id: "u-ad", branchCode: "B1" },
      body: { name: "Side Door", deviceId: "K30-3" },
    });
    const out = await runHandler(createScanner, req);
    assert.equal(out.ok, true);
    assert.equal(out.res.statusCode, 201);
    assert.equal(createdDoc.branchCode, "B1");
  });

  it("an admin can update, disable, rotate and sync a scanner in their branch", async () => {
    store.scanner = { _id: "s1", branchCode: "MAIN", save: async function () {} };

    let out = await runHandler(updateScanner, adminReq({ body: { status: "maintenance" } }));
    assert.equal(out.ok, true);
    assert.equal(out.res.statusCode, 200);

    out = await runHandler(deleteScanner, adminReq());
    assert.equal(out.ok, true);
    assert.equal(store.scanner.status, "disabled");

    out = await runHandler(rotateScannerKey, adminReq());
    assert.equal(out.ok, true);
    assert.ok(out.res.body.data.apiKey);

    out = await runHandler(getSyncPayload, adminReq());
    assert.equal(out.ok, true);
    assert.equal(out.res.statusCode, 200);
  });
});

describe("non-admin roles are blocked", () => {
  it("adminOnly rejects trainers with 403", async () => {
    const err = await callChain([adminOnly], { user: { role: "trainer" } });
    assert.ok(err);
    assert.equal(err.statusCode, FORBIDDEN);
  });

  it("adminOnly rejects requests without a user with 401", async () => {
    const err = await callChain([adminOnly], {});
    assert.ok(err);
    assert.equal(err.statusCode, 401);
  });
});