const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const DeviceCommand = require("../models/deviceCommand.model");
const {
  enqueueCommand,
  dequeuePendingCommand,
  acknowledgeCommand,
  enqueueRestrictionCommand,
  GATE_RESTRICTION_COMMAND
} = require("../services/deviceCommand.service");
const { buildGetRequestResponse } = require("../utils/admsResponse");

const store = { commands: [], seq: 0 };

function matching(query) {
  return store.commands.filter((command) =>
    Object.entries(query).every(([key, value]) => command[key] === value)
  );
}

function chainableFindOne(resolveResult) {
  const state = { sortDir: 0, fields: null, lean: false };
  const chainable = {
    sort(dir) {
      state.sortDir = dir;
      return chainable;
    },
    select(fields) {
      state.fields = fields;
      return chainable;
    },
    lean() {
      state.lean = true;
      return chainable;
    },
    then(onOk, onError) {
      return Promise.resolve(resolveResult(state)).then(onOk, onError);
    }
  };
  return chainable;
}

before(() => {
  DeviceCommand.getNextCommandId = async (serialNumber) => {
    const last = store.commands
      .filter((c) => c.serialNumber === serialNumber)
      .sort((a, b) => b.commandId - a.commandId)[0];
    return (last ? last.commandId : 0) + 1;
  };

  DeviceCommand.create = async (doc) => {
    const rec = { ...doc, _id: "cmd-" + store.seq++, save: async function () { return this; } };
    store.commands.push(rec);
    return rec;
  };

  DeviceCommand.findOne = (query) =>
    chainableFindOne((state) => {
      const list = matching(query);
      if (state.sortDir > 0) list.sort((a, b) => a.commandId - b.commandId);
      else if (state.sortDir < 0) list.sort((a, b) => b.commandId - a.commandId);
      return list[0] || null;
    });
});

after(() => {
  delete DeviceCommand.findOne;
  delete DeviceCommand.create;
  delete DeviceCommand.getNextCommandId;
});

describe("DeviceCommand queue lifecycle", () => {
  it("auto-increments commandId per device", async () => {
    store.commands = [];
    const a = await enqueueCommand({ serialNumber: "SN-A", commandString: "X" });
    const b = await enqueueCommand({ serialNumber: "SN-A", commandString: "Y" });
    const c = await enqueueCommand({ serialNumber: "SN-B", commandString: "Z" });
    assert.equal(a.commandId, 1);
    assert.equal(b.commandId, 2);
    assert.equal(c.commandId, 1);
  });

  it("dequeues the oldest pending command and marks it sent", async () => {
    store.commands = [];
    await enqueueCommand({ serialNumber: "SN-A", commandString: "first" });
    await enqueueCommand({ serialNumber: "SN-A", commandString: "second" });
    const cmd = await dequeuePendingCommand("SN-A");
    assert.equal(cmd.commandString, "first");
    assert.equal(cmd.status, "sent");
    const pending = store.commands.filter((c) => c.status === "pending");
    assert.equal(pending.length, 1);
    assert.equal(pending[0].commandString, "second");
  });

  it("returns null when no pending command exists", async () => {
    store.commands = [];
    assert.equal(await dequeuePendingCommand("SN-EMPTY"), null);
  });

  it("acknowledges execution (Return=0 -> executed, non-zero -> failed)", async () => {
    store.commands = [];
    const okCmd = await enqueueCommand({ serialNumber: "SN-A", commandString: "X" });
    const ok = await acknowledgeCommand({
      serialNumber: "SN-A",
      commandId: okCmd.commandId,
      returnCode: "0",
      rawBody: "ID=1&Return=0&CMD=DATA"
    });
    assert.equal(ok.status, "executed");
    assert.equal(ok.responseRaw, "ID=1&Return=0&CMD=DATA");

    const failCmd = await enqueueCommand({ serialNumber: "SN-A", commandString: "X" });
    const failed = await acknowledgeCommand({
      serialNumber: "SN-A",
      commandId: failCmd.commandId,
      returnCode: "100",
      rawBody: "ID=2&Return=100&CMD=DATA"
    });
    assert.equal(failed.status, "failed");
  });

  it("returns null when acknowledging an unknown commandId", async () => {
    store.commands = [];
    assert.equal(await acknowledgeCommand({ serialNumber: "SN-A", commandId: 999, returnCode: "0" }), null);
  });

  it("formats the getrequest response or the keep-alive newline", () => {
    const payload = buildGetRequestResponse({ commandId: 3, commandString: GATE_RESTRICTION_COMMAND });
    assert.equal(payload, `C:3:${GATE_RESTRICTION_COMMAND}`);
    assert.equal(buildGetRequestResponse(null), "\n");
    assert.equal(buildGetRequestResponse({ commandString: "no-id" }), "\n");
  });

  it("enqueues a restriction command only for eligibility reasons", async () => {
    store.commands = [];
    const scanner = { serial: "SN-A" };

    await enqueueRestrictionCommand(scanner, "expired");
    assert.equal(store.commands.length, 1);
    assert.match(store.commands[0].commandString, /^DATA UPDATE OPTIONS AccessRuleType=0/);
    assert.equal(store.commands[0].status, "pending");

    await enqueueRestrictionCommand(scanner, "not_matched");
    assert.equal(store.commands.length, 1, "non-restriction reasons must not enqueue a command");

    assert.equal(await enqueueRestrictionCommand(null, "expired"), null);
    assert.equal(await enqueueRestrictionCommand(scanner, undefined), null);
  });
});