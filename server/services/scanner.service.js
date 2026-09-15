const Attendance = require("../models/attendance.model");
const Member = require("../models/member.model");
const ScannerEvent = require("../models/scannerEvent.model");
const { getEligibilityIssue } = require("../utils/membership");
const { formatDateInTimezone, DEFAULT_TIMEZONE } = require("../utils/date");

const LATE_THRESHOLD_HOUR = 9;

function getHourInTimeZone(date, timezone = DEFAULT_TIMEZONE) {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(date)
  );
}

function resolveMember(gymId, event) {
  if (event.userId !== undefined && event.userId !== null && event.userId !== "") {
    return Member.findOne({ gymId, "biometrics.deviceUserId": String(event.userId) });
  }
  if (event.cardId) {
    return Member.findOne({ gymId, "biometrics.cardId": String(event.cardId) });
  }
  return null;
}

async function logScannerEvent({ scanner, member, attendance, event, decision, reason, deviceEventId, timestamp, eventType }) {
  return ScannerEvent.create({
    gymId: scanner.gymId,
    branchCode: scanner.branchCode || "MAIN",
    scanner: scanner._id,
    deviceId: scanner.deviceId,
    member: member ? member._id : null,
    attendance: attendance ? attendance._id : null,
    eventType,
    decision,
    reason,
    deviceEventId,
    timestamp,
    raw: event || {}
  });
}

const push = (attendance, action, eventTime, member, scanner, eventType, deviceEventId) => {
  attendance.auditLogs.push({
    action,
    performedBy: member.user,
    timestamp: new Date(),
    details: `Scanner ${scanner.name || scanner.deviceId} ${action.replace("_", " ")}`,
    ipAddress: "scanner"
  });
  attendance.source = "scanner";
  attendance.scanner = scanner._id;
  attendance.eventType = eventType;
  attendance.deviceEventId = deviceEventId;
  return attendance;
};

async function processScannerEvent({ scanner, event }) {
  const gymId = scanner.gymId;
  const eventTime = event.timestamp ? new Date(event.timestamp) : new Date();
  const eventType = event.eventType || "fingerprint";
  const deviceEventId = event.deviceEventId || `${scanner.deviceId}:${new Date(eventTime).getTime()}`;
  const raw = event || {};

  const existingEvent = await ScannerEvent.findOne({ deviceEventId });
  if (existingEvent) return { status: "duplicate", id: existingEvent._id };

  const verified = event.verified !== false && event.decision !== "deny";

  if (!verified) {
    const created = await logScannerEvent({ scanner, event, eventType, decision: "deny", reason: "not_matched", deviceEventId, timestamp: eventTime });
    return { status: "denied", reason: "not_matched", id: created._id };
  }

  const member = await resolveMember(gymId, event);
  if (!member) {
    const created = await logScannerEvent({ scanner, event, eventType, decision: "deny", reason: "unknown_user", deviceEventId, timestamp: eventTime });
    return { status: "denied", reason: "unknown_user", id: created._id };
  }

  const issue = getEligibilityIssue(member);
  if (issue) {
    const created = await logScannerEvent({ scanner, member, event, eventType, decision: "deny", reason: issue, deviceEventId, timestamp: eventTime });
    return { status: "denied", reason: issue, id: created._id };
  }

  const today = formatDateInTimezone(eventTime);
  const hour = getHourInTimeZone(eventTime);
  const isLate = hour >= LATE_THRESHOLD_HOUR;

  let attendance = await Attendance.findOne({ gymId, member: member._id, date: today, deletedAt: null });

  if (attendance && attendance.checkIn && attendance.checkOut) {
    const created = await logScannerEvent({ scanner, member, attendance, event, eventType, decision: "allow", reason: "duplicate", deviceEventId, timestamp: eventTime });
    return { status: "duplicate", id: created._id };
  }

  if (attendance && attendance.checkIn && scanner.settings.enableCheckOutOnSecondScan !== false) {
    attendance.checkOut = new Date(eventTime);
    if (attendance.status === "present") attendance.status = "completed";
    push(attendance, "check-out", eventTime, member, scanner, eventType, deviceEventId);
    await attendance.save();
    const created = await logScannerEvent({ scanner, member, attendance, event, eventType, decision: "allow", reason: "checkout", deviceEventId, timestamp: eventTime });
    return { status: "checkout", id: created._id };
  }

  if (attendance && !attendance.checkIn) {
    attendance.checkIn = new Date(eventTime);
    attendance.status = isLate ? "late" : "present";
    push(attendance, "check-in", eventTime, member, scanner, eventType, deviceEventId);
    await attendance.save();
    const created = await logScannerEvent({ scanner, member, attendance, event, eventType, decision: "allow", reason: "verified", deviceEventId, timestamp: eventTime });
    return { status: "checkin", id: created._id };
  }

  let newAttendance;
  try {
    newAttendance = await Attendance.create({
      gymId,
      branchCode: scanner.branchCode || "MAIN",
      member: member._id,
      date: today,
      checkIn: new Date(eventTime),
      status: isLate ? "late" : "present",
      source: "scanner",
      scanner: scanner._id,
      eventType,
      deviceEventId,
      timezone: DEFAULT_TIMEZONE,
      auditLogs: [{
        action: "check-in",
        performedBy: member.user,
        timestamp: new Date(eventTime),
        details: `Scanner ${scanner.name || scanner.deviceId} check-in`,
        ipAddress: "scanner"
      }]
    });
  } catch (err) {
    if (err.code === 11000) {
      const created = await logScannerEvent({ scanner, member, event, eventType, decision: "deny", reason: "duplicate", deviceEventId, timestamp: eventTime });
      return { status: "duplicate", id: created._id };
    }
    throw err;
  }

  const created = await logScannerEvent({ scanner, member, attendance: newAttendance, event, eventType, decision: "allow", reason: "verified", deviceEventId, timestamp: eventTime });
  return { status: "checkin", id: created._id };
}

module.exports = { processScannerEvent, resolveMember };