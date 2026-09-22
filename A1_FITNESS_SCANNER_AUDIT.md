# A1 Fitness — Scanner Section Investigation Report (Admin & Superadmin)

Status: READ-ONLY investigation. No source files were created, modified, or deleted.
Purpose: define everything the Scanner section must do so a fresh Node.js + MongoDB backend can reproduce it for the future React.js frontend.

---

## 1. Task & Scope
- Determine everything the Scanner section must do so a fresh Node.js + MongoDB backend can reproduce it for the future React.js frontend.
- Two separate lenses: **Admin** (branch-scoped, full device management) and **Superadmin** (cross-branch, read-only).
- Frontend (React Native `src/`) is the source of truth; the existing backend (`server/`) is inspected second.
- Device-facing ingestion is treated as a separate concern from admin/superadmin management UI, and Scanner **events** are treated separately from **Attendance**.

---

## 2. File Inventory

| File | Component / Layer | Admin | Superadmin | Purpose |
|---|---|---|---|---|
| `src/navigation/types.ts:19-24` | Route types | ✓ | ✓ | `ScannerList`, `ScannerDetails{scannerId}`, `ScannerForm{scannerId?}`, `ScannerIntegration`, `ScannerSetup{scannerId?}`, `ScannerDetail{scannerId}` |
| `src/navigation/index.tsx:74-76` | Superadmin stack | | ✓ | Registers only List/Details/Form (real-API) |
| `src/navigation/index.tsx:86-91` | Admin stack | ✓ | | Registers List/Details/Form + Integration/Setup/Detail (prototype) |
| `src/navigation/index.tsx:58,102` | Provider | ✓ | ✓ | `ScannerProvider` (mock) wraps whole app |
| `src/components/drawer/AdminDrawer.tsx:34` | Drawer nav | ✓ | | `Scanners` → `ScannerList` |
| `src/components/drawer/SuperadminDrawer.tsx:35` | Drawer nav | | ✓ | `Scanners` → `ScannerList` |
| `src/screens/ScannerListScreen.tsx` | List | R+W | R | Uses real API `getScanners()` |
| `src/screens/ScannerFormScreen.tsx` | Create/Edit | ✓ | read-only view | Real API create/update/get; API-key modal |
| `src/screens/ScannerDetailsScreen.tsx` | Device detail | R+W actions | R | Status change, sync payload, rotate key, disable |
| `src/screens/ScannerIntegrationScreen.tsx` | Prototype list | ✓ | ✗ | Mock `useScanners()`; "UI prototype" |
| `src/screens/ScannerSetupScreen.tsx` | Prototype form | ✓ | ✗ | Mock; 6 connection methods; local-state only |
| `src/screens/ScannerDetailScreen.tsx` | Prototype detail | ✓ | ✗ | Mock connection test; masked secrets |
| `src/screens/AdminAttendanceScreen.tsx` | Attendance | R | | Real API `getAttendance`; entry to ScannerIntegration |
| `src/screens/SuperadminAttendanceScreen.tsx` | Attendance | | R | Real API + branch filter (ALL) |
| `src/api/scanners.ts` | API module | ✓ | ✓ | 7 real endpoints (below) |
| `src/api/attendance.ts` | API module | ✓ | ✓ | list/get/check-in/check-out/update/delete |
| `src/api/members.ts:133-138` | API module | ✓ | ✓ | `updateMemberBiometrics()` — **never called by any screen** |
| `src/mocks/ScannerProvider.tsx` | Mock store | ✓ | ✗ | add/update/remove/test (75% random pass) |
| `src/mocks/scannerData.ts` | Mock model+seeds | ✓ | ✗ | MockScanner, 4 mock branches, seeds |
| `server/routes/scanner.routes.js` | Routes | ✓ | ✓ | CRUD read (both) + admin-only mutations + device endpoints |
| `server/controllers/scanner.controller.js` | CRUD controller | ✓ | R | List/get/create/update/soft-disable/rotate-key/sync-payload |
| `server/controllers/scannerEvents.controller.js` | Ingest/heartbeat | — | — | Device-authorized event processing |
| `server/services/scanner.service.js` | Event business logic | — | — | Member resolution, eligibility, check-in/out, dedup |
| `server/middlewares/scannerAuth.middleware.js` | Device auth | — | — | `x-scanner-id`, `x-scanner-key`, `x-push-secret` |
| `server/models/scanner.model.js` | Model | ✓ | ✓ | Hashed API key, status, settings |
| `server/models/scannerEvent.model.js` | Model | — | — | Log of every allow/deny decision |
| `server/routes/attendance.routes.js` | Routes | ✓ | ✓ | member + admin/trainer check-in, history, update/delete |
| `server/controllers/attendance.controller.js` | Controller | ✓ | ✓ | mark/history/check-in/out/update/delete + stats |
| `server/models/attendance.model.js` | Model | ✓ | ✓ | indexed, soft-delete, audit logs |
| `server/middlewares/auth.middleware.js:76-84` | `adminOnly` | — | — | Blocks superadmin from scanner mutations (403) |
| `server/middlewares/branchScope.middleware.js` | Scope | — | — | `enforceBranchOwnership` |
| `server/utils/{deviceKey,membership,date}.js` | Utils | — | — | sha256 key hash, eligibility, IST date |
| `server/test/scanner-{permissions,service,utils}.test.js` | Tests | — | — | Encode documented contracts |

---

## 3. Navigation & Entry Points

- **Admin:** Drawer → `Scanners` → `ScannerList` (`AdminDrawer.tsx:34`). Plus a second path: **AdminAttendanceScreen** card "Scanner Integration / Manage Scanners · Connect Scanner" (`AdminAttendanceScreen.tsx:182-195`) → `ScannerIntegration` (mock prototype, then `ScannerSetup`/`ScannerDetail`). The prototype is registered ONLY in the Admin stack (`index.tsx:89-91`).
- **Superadmin:** Drawer → `Scanners` → `ScannerList` (`SuperadminDrawer.tsx:35`). No prototype screens registered (`index.tsx:74-76`); Attendance screen has no scanner card.
- Inside ScannerList: tap card → `ScannerDetails{scannerId}` (both roles). `+` button / "Add scanner" → `ScannerForm` (Admin only; hidden for superadmin, `ScannerListScreen.tsx:92-102,163-171`).
- Edit from Details → `ScannerForm{scannerId}` (Admin only; Edit button hidden for superadmin, `ScannerDetailsScreen.tsx:153-161`).

---

## 4. Role-Based Access Summary

| Capability | Admin | Superadmin |
|---|---|---|
| List scanners (`GET /scanners`) | ✓ (scoped to own branch) | ✓ (all, or `?branchCode=`) |
| View scanner (`GET /scanners/:id`) | ✓ (own branch) | ✓ |
| Create (`POST /scanners`) | ✓ (branch forced) | 403 |
| Update (`PATCH /scanners/:id`) | ✓ | 403 |
| Soft-disable (`DELETE /:id`) | ✓ | 403 |
| Rotate key (`POST /:id/rotate-key`) | ✓ | 403 |
| Sync payload (`GET /:id/sync-payload`) | ✓ | 403 |
| Prototype UI (Integration/Setup/Detail) | ✓ mock only | ✗ (not navigable) |

Enforced in **three layers**: UI (buttons hidden / read-only views), middleware (`adminOnly` returns 403 for any non-admin including superadmin, `auth.middleware.js:76-84`), and controller (`assertAdminWrite`, `scanner.controller.js:18-22`). The permission tests lock this in (`server/test/scanner-permissions.test.js:111-143`).

---

## 5. Frontend Type Models (`src/api/scanners.ts`)
- `ScannerType`: `fingerprint | card | fingerprint_card | face`
- `ScannerProtocol`: `tcp | usb | p2p`
- `ScannerStatus`: `online | offline | maintenance | disabled`
- `ScannerItem`: `_id, gymId, branchCode, name, brand, model, deviceId, serial?, ipAddress?, port?, protocol, type, status, gates?, settings{enforceMembership?, enableCheckOutOnSecondScan?}, lastSeen?, lastEventAt?, lastSync?, errorLogs?, createdAt?, updatedAt?, apiKey?`
- `ScannerSyncMember`: `memberId, name, secretCode, deviceUserId, cardId, active, membershipExpiryDate?, fingerprintCount`
- `ScannerSyncPayload`: `{ scanner, count, members }`
- Mock model (`scannerData.ts`) is entirely separate: `ScannerConnectionMethod` = `TCP/IP | HTTP/API | ADMS/PUSH | USB | LOCAL_GATEWAY | OTHER`, `ScannerStatus` = `NOT_TESTED | PENDING_HARDWARE_TEST | DEMO_CONNECTED | DEMO_FAILED | OFFLINE`. Mock branches: MAIN, BR02, BR03, BR04 (id `br-main`, `br-c`, `br-e`, `br-n`).

---

## 6. Backend Mongo Models

**Scanner** (`scanner.model.js`)
- `gymId` (req, idx), `branchCode` default `"MAIN"` (idx), `name`, `brand` default `eSSL`, `model` default `K30 Pro`, `deviceId` (**unique, global** — not per-gym), `serial`, `ipAddress`, `port` default `8200`, `protocol` enum, `type` enum, `status` enum default `offline`, `apiKeyHash` (`select:false`, sha256), `gates[]`, `settings{enforceMembership=true, enableCheckOutOnSecondScan=true}`, `lastSeen`, `lastEventAt`, `lastSync`, `errorLogs[]` (capped at 50 in `logError`), `createdBy` ref User. Compound index `{gymId, branchCode}`.

**ScannerEvent** (`scannerEvent.model.js`) — audit-only, written by device ingestion
- `gymId, branchCode, scanner` ref, `deviceId`, `member` ref (null), `attendance` ref (null), `eventType` enum `fingerprint|card|pin|face`, `decision` enum `allow|deny` (req), `reason` enum `verified|not_matched|unknown_user|ineligible|expired|payment_pending|duplicate|checkout|disabled_device`, `deviceEventId` unique sparse, `timestamp` (req, idx), `raw` Mixed. Index `{gymId, timestamp:-1}`.

**Attendance** (`attendance.model.js`)
- `gymId`, `member` ref (req), `date` (YYYY-MM-DD string, req, idx), `checkIn`, `checkOut`, `status` enum `present|completed|absent|late|half-day`, `faceRecognitionMatched`, `source` enum `app|secret_code|admin|trainer|scanner` (default `app`), `scanner` ref, `eventType` enum, `deviceEventId`, `notes` (≤500), `timezone` default `Asia/Kolkata`, `location{checkIn,checkOut}`, `deletedAt` (soft), `auditLogs[]`, `branchCode`.
- Unique index `{gymId, member, date}`; unique partial on `deviceEventId`; methods `softDelete`, `addAuditLog`; statics `findByMemberAndDate`, `getMemberAttendanceStats`; controller adds `Attendance.cacheAttendanceStatus`.

---

## 7. Admin Scanner Flow (end-to-end)

**List** (`ScannerListScreen.tsx`)
1. Mount → `setActive('Scanners')` → `getScanners()` → `GET /api/scanners` (auth Bearer).
2. Backend: `protect` → `authorize("admin","superadmin")` (superadmin bypass) → `getScanners` queries `{gymId, branchCode: admin.branchCode}` → returns array minus `apiKeyHash`, sorted `createdAt:-1`.
3. UI: KPI Total/Online, per-card status dot (on=success/off=muted/maintenance=amber/disabled=danger), tap → `ScannerDetails`.

**Create** (`ScannerFormScreen.tsx`)
1. `+` → `ScannerForm` (no params). Fields: Name*, Device ID* (immutable after save), Serial, Brand, Model, IP, Port (default 8200), Protocol chips, Reader Type chips, "Check-out on second scan" toggle.
2. Save → `createScanner({ name, deviceId, serial, brand, model, ipAddress, port, protocol, type, settings:{enforceMembership:true, enableCheckOutOnSecondScan}, branchCode: admin.branchCode })`.
3. Backend `createScanner`: `adminOnly` 403-guard; requires `name`+`deviceId`; 409 on duplicate `deviceId`; **forces** `branchCode = req.user.branchCode` (client value ignored); scrubs `apiKey/apiKeyHash/gymId/branchCode` from body; stores sha256 `apiKeyHash`; returns 201 `data` = scanner **with plaintext `apiKey`**.
4. UI shows one-time modal: "Configure the device gateway to push events using this API key in the x-scanner-key header (or the gym-wide push secret). It will not be shown again."

**Details/Actions** (`ScannerDetailsScreen.tsx`)
- `GET /scanners/:id` → `findScannedById` (404 if not in admin's branch via `enforceBranchOwnership`).
- Status chips `online|offline|maintenance` → `PATCH /scanners/:id {status}` (`updateScanner` whitelist; on any non-`disabled` status update backend sets `lastSeen = now`).
- "Generate enrollment payload" → `GET /:id/sync-payload` → returns `count` + members `{memberId,name,secretCode,deviceUserId,cardId,active,membershipExpiryDate,fingerprintCount}`; UI shows "`N` member(s) ready for enrollment (`M` active)."
- "Rotate API key" → `POST /:id/rotate-key` → new sha256 hash stored; UI shows plaintext once.
- "Disable scanner" / re-enable → `DELETE /:id` → backend sets `status='disabled'` (**soft disable**, history preserved).

**Prototype (mock, Admin-only)** — `ScannerIntegrationScreen` → `ScannerSetupScreen` (save to local context), `ScannerDetailScreen` (demo test, random 75% success, 1.2–2 s, never contacts hardware). Explicitly labeled "UI prototype only. … does not contact a real K30 Pro device or any backend." (`ScannerDetailScreen.tsx:162-165`, `ScannerSetupScreen.tsx:278-281`, `ScannerIntegrationScreen.tsx:128-131`).

---

## 8. Superadmin Scanner Flow (end-to-end)

1. Drawer → `ScannerList` → `getScanners()` → `GET /api/scanners`. Backend: `authorize` superadmin bypass → query `{gymId}` plus `branchCode` **only if** `?branchCode=` given and not `ALL`. (RN currently sends **no** `branchCode` param, so superadmin sees all branches.)
2. Subtitle shows `N devices · M online` (`ScannerListScreen.tsx:91`). No `+` button; empty state says branch admins register devices.
3. `ScannerDetails` — Edit button hidden, Action section hidden (`ScannerDetailsScreen.tsx:153-161,213-247`); footer: "Superadmin access is read-only."
4. `ScannerForm` reachable only via direct navigation; renders a "Read-only access" panel (`ScannerFormScreen.tsx:140-148`).
5. Any backend mutation attempt → `adminOnly` 403 "Only branch admins can manage scanners" (`auth.middleware.js:80-81`; `scanner.controller.js:18-22`).
6. Superadmin CAN update/delete **attendance records** (see §10) but NOT scanners.

---

## 9. Admin vs Superadmin Comparison

| Aspect | Admin | Superadmin |
|---|---|---|
| Branch data visibility | Own branch only (query forced, `scanner.controller.js:26-27`) | All branches; optional `?branchCode=` |
| Create/edit/disable/key/sync | Yes | 403 |
| `apiKey` visibility | At creation/rotation only | Never (read-only) |
| Prototype screens | Available via Attendance card | Not registered |
| Attendance list scope | Own branch only, no branch filter UI | Branch filter with `ALL` (`SuperadminAttendanceScreen.tsx:146,185`) |
| Attendance update/delete | Own branch only | All branches |

Both roles read scanner status fields `lastSeen/lastEventAt/lastSync` and see identical device card layout.

---

## 10. Admin & Superadmin API Contract Tables

**Scanner (authenticated user, `scanner.routes.js`)**

| Method + Path | Auth | Admin | Superadmin | Response data |
|---|---|---|---|---|
| `GET /api/scanners` | `protect, authorize("admin","superadmin")` | ✓ (branch-scoped) | ✓ (all / `?branchCode=`) | `ScannerItem[]` |
| `GET /api/scanners/:id` | same | ✓ (branch) | ✓ | `ScannerItem` |
| `POST /api/scanners` | `protect, adminOnly` | ✓ | 403 | scanner + plaintext `apiKey` |
| `PATCH /api/scanners/:id` | `protect, adminOnly` | ✓ | 403 | scanner |
| `DELETE /api/scanners/:id` | `protect, adminOnly` | ✓ (disable) | 403 | scanner (disabled) |
| `POST /api/scanners/:id/rotate-key` | `protect, adminOnly` | ✓ | 403 | `{apiKey}` |
| `GET /api/scanners/:id/sync-payload` | `protect, adminOnly` | ✓ | 403 | `{scanner:deviceId, count, members[]}` |

**Attendance (authenticated user, `attendance.routes.js`)**

| Method + Path | Roles | Purpose |
|---|---|---|
| `POST /api/attendance/mark` | `protectOptional` | secret-code self check-in/out (geofenced) or admin/trainer by `memberId` |
| `POST /api/attendance/check-in` | member (`checkPlanAccess`) | member self check-in (geofence disabled) |
| `POST /api/attendance/check-out` | member | member self check-out (geofenced) |
| `GET /api/attendance/me[/today|/stats|/export|/realtime]` | member | self views |
| `GET /api/attendance` | admin, trainer | paginated history (search/date/branch) — used by both Admin & Superadmin screens |
| `POST /api/attendance/check-in` | admin, trainer | manual check-in by `member` |
| `PATCH /api/attendance/check-out/:id` | admin, trainer | manual check-out |
| `POST /api/attendance/face-verify` | admin, trainer | placeholder (fixed `matched:true, confidence:0.88`) |
| `PUT /api/attendance/:id` | admin, **superadmin** | update status/notes/checkIn/checkOut |
| `DELETE /api/attendance/:id` | admin, **superadmin** | soft delete |

Both Attendance screens (`AdminAttendanceScreen.tsx`, `SuperadminAttendanceScreen.tsx`) are **view-only**: they call only `getAttendance({date, search, branchCode?, page, limit:20})`. No screen calls `checkInAttendance`/`checkOutAttendance`/`updateAttendance`/`deleteAttendance`; those API functions exist for future/admin use.

---

## 11. Device/Gateway-Facing Endpoints (no user session)

| Method + Path | Auth | Purpose |
|---|---|---|
| `POST /api/scanners/events` | `authenticateDevice` | Batch ingest: body = array | `{events}` | `{transactions}` |
| `POST /api/scanners/heartbeat` | `authenticateDevice` | Set `status` (body.status) + `lastSeen` |

**`authenticateDevice` (`scannerAuth.middleware.js`):**
1. Device identity: header `x-scanner-id` **or** body `deviceId` (401 if missing; 404 if not registered; 403 if `status==='disabled'`).
2. Credentials: header `x-scanner-key` **or** body `apiKey`, compared via sha256 to `scanner.apiKeyHash`; **or** header `x-push-secret` equal to env `DEVICE_PUSH_SECRET` (gym-wide bypass).

`ingestEvents` marks scanner `online` + `lastSeen` + `lastEventAt`, then runs each event through `processScannerEvent`, returning 202 `{scanner, counts{received,checkin,checkout,denied,duplicate}, events:[{status,reason}]}`.

---

## 12. Scanner Events vs Attendance (business rules — `scanner.service.js`)

`processScannerEvent({scanner, event})` in order:
1. `eventTime = event.timestamp || now`; `eventType = event.eventType || 'fingerprint'`; `deviceEventId = event.deviceEventId || \`${deviceId}:${ts}\``.
2. **Dedupe:** if a `ScannerEvent` already exists with that `deviceEventId` → `duplicate` (idempotent ingestion).
3. **Not matched:** `event.verified === false || event.decision === 'deny'` → deny `not_matched`.
4. **Resolve member:** `event.userId` → `Member.findOne({gymId, "biometrics.deviceUserId"})`; else `event.cardId` → `"biometrics.cardId"`; else deny `unknown_user`.
5. **Eligibility** (`getEligibilityIssue`): status in `[inactive,pending,cancelled,expired,frozen]` → `ineligible`; expiry past → `expired`; `paymentStatus ≠ paid` → `payment_pending`. (Note `settings.enforceMembership` is stored but **not read** by the service — eligibility is always enforced.)
6. **Date/late:** `today = formatDateInTimezone(eventTime)` (IST); `hour` via `Intl` with `DEFAULT_TIMEZONE`; `isLate = hour >= 9`.
7. Find today's attendance (`deletedAt:null`):
   - `checkIn && checkOut` → `duplicate` (allow).
   - `checkIn && settings.enableCheckOutOnSecondScan !== false` → **check-out**: set `checkOut`, status `present→completed`; audit `check-out`; reason `checkout`.
   - `!checkIn` → fill `checkIn`, status `late|present`; reason `verified`.
   - none → create new doc (source `scanner`, scanner ref, eventType, deviceEventId, audit `check-in`); on Mongo 11000 (unique `{gymId,member,date}`) → `duplicate`.
8. Every decision logs a `ScannerEvent` (`decision: allow|deny` + reason) with `raw` payload.

Test contracts confirm: late threshold 09:00 IST, second-scan checkout, third-scan dedupe, unknown/expired/rejected rejection, `deviceEventId` dedupe (`scanner-service.test.js`).

---

## 13. Attendance Querying & Filtering (what the fresh backend must reproduce)

`history` (`attendance.controller.js:771-824`):
- `getPagination` (page≥1, limit default 20, max 100, skip).
- Optional `date` (exact `YYYY-MM-DD`), `search` (member `user.name` via aggregation), `branchCode` (superadmin only, `ALL`=none).
- **Non-superadmin scope is member-linked**: `Member.find({branchCode: requestedBranch})` → `distinct('_id')` → `member: {$in}` (attendance follows a member even if branch reassigned, `:784-794`).
- Trainer further restricted to assigned members.
- Sort `createdAt:-1`; populate `member.user(name email phone)`.
- Superadmin screen sends `branchCode` only when ≠ `ALL` (`SuperadminAttendanceScreen.tsx:185`); Admin screen never sends it (locked to own branch).

---

## 14. Date/Time Handling
- `DEFAULT_TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata'` (`date.js`).
- `formatDateInTimezone` uses `Intl.DateTimeFormat('en-CA', {timeZone})` → `YYYY-MM-DD`; avoids the UTC-day rollover bug (test `scanner-utils.test.js:9-25`).
- Scanner service late-check uses IST-aware hour. **Inconsistent:** app/admin check-in paths (`markAttendance`, `memberCheckIn`) use `serverTime.getHours()` (server-local, `attendance.controller.js:117,239`), while member check-out and scanner events are timezone-aware.

---

## 15. Error Handling & Response Format
- Envelope everywhere: `{success, message, data}` (`sendResponse`); errors via `AppError`/`errorHandler`.
- Scanner-specific codes: 400 missing fields / invalid events; 401 invalid credentials (device or user); 403 disabled device / superadmin write / trainer isolation; 404 unregistered device / cross-branch record (`findScannedById` returns 404 for other-branch scanners — "Scanner not found in your branch"); 409 duplicate `deviceId`; 202 events processed; 400 already-checked-in/out, not checked in, "Attendance already completed for today", geofence messages (secret-code only).
- `adminOnly`'s error message is scanner-specific even though the middleware is generic.

---

## 16. Auth Overview (for fresh-backend parity)
- User: JWT `{sub, role}` access token (`JWT_ACCESS_SECRET`), `protect` blocks `inactive` users and members with blocked statuses.
- `authorize(...)` bypasses for superadmin (`auth.middleware.js:46`).
- `adminOnly` = strict `role === 'admin'` (scanner mutations).
- Device: static-key scheme above (sha256 hashes only; plaintext shown once).
- `protectOptional` on `/attendance/mark` downgrades to secret-code mode when no token.

---

## 17. Caching / Realtime / Rate Limiting
- Socket.io: clients join `gymId` room; attendance check-in/out/manual events emit `attendance:update|checkin|checkout` (`attendance.controller.js:145-152,197-202,271-278,335-341`). Device ingestion emits **nothing**.
- Redis: `attendance:today:{gymId}:{memberId}` cache (TTL 86400 via `cacheAttendanceStatus`; realtime 30 s).
- Rate limit: global 300 req/15 min **skipped** for `/api/scanners` ("devices get their own dedicated higher limits", `server.js:152-159`) — but **no such dedicated limiter exists** in code.
- CORS `allowedHeaders` = `Content-Type, Authorization` only; device `x-scanner-*` headers pass only because no-Origin requests are allowed (`server.js:74-78,100-103`).

---

## 18. Known Issues & Discrepancies
1. **No event-history API**: `ScannerEvent` is write-only; there is no endpoint for admins to view scanner events (the model + logs exist).
2. **Mock prototype coexists with production UI**: `ScannerIntegration/Setup/Detail` are Admin-only, purely local-state, and reference a different scanner model (6 connection methods) than the real API (3 protocols). They must be excluded from the fresh-backend spec or supplanted by real screens.
3. **Dead UI**: ScannerForm's Superadmin "Branch Code" field (`ScannerFormScreen.tsx:229-240`) is unreachable (superadmin never reaches the form).
4. **Unused subscriber**: `updateMemberBiometrics` in `api/members.ts:133` is never called; there is no UI to set `biometrics.deviceUserId/cardId`, so members must be enrolled by an external/admin process for scanner recognition to work.
5. **Timezone inconsistency** in late-marking between server-clock paths and IST-aware scanner path (§14).
6. **Global unique `deviceId`** — not per-gym — so two gyms cannot register the same device; `authenticateDevice` also matches `deviceId` without a gym scope.
7. **`reason: 'disabled_device'`** in the enum is never produced.
8. **`GRACE_PERIOD_MINUTES = 15`** (`attendance.controller.js:12`) is defined but unused.
9. **Rate-limit comment promises dedicated device limits that don't exist.**
10. **Admin/trainer manual check-in does not set `source='admin'`** — default `'app'` is used (only scanner writes `source='scanner'`).
11. **`settings.enforceMembership` is stored but never honored** in `scanner.service.js` (always enforced).

---

## 19. Legacy/Unused Classification

| Item | Status | Verdict |
|---|---|---|
| `ScannerProvider` / `scannerData` mock stack | Prototype, admin-only demo | **Unused for real flow; exclude or replace** |
| `ScannerIntegration/Setup/Detail` screens | Prototype | Unused (real List/Form/Details supersede) |
| `updateMemberBiometrics` API fn | Defined, never called | Unused |
| `faceVerifyPlaceholder` route | Placeholder stub | Unused (replace with real or drop) |
| `scannerEvent` API (list events) | Does not exist | Gap — decide if event viewer is needed |
| `GRACE_PERIOD_MINUTES` | Dead constant | Remove |
| `reason 'disabled_device'` | Never emitted | Remove or implement |
| `enforceMembership` setting | Stored, not read | Decide semantics for fresh backend |
| Device rate limiter | Claimed, absent | Gap — implement dedicated device ratelimit |
| `errorLogs`/`logError` | Model present; no caller found | Effectively unused |

---

## 20. Minimum Fresh-Backend Specification (derived, read-only)
1. Entity model: `Scanner` (as §6) with hashed key, `ScannerEvent`, reused `Attendance` + `Member.biometrics{deviceUserId, cardId, fingerprints}`.
2. Roles: scanner reads → admin+superadmin; scanner mutations → admin only (403 for superadmin); branch scoping identical (forced for admin, `?branchCode=` for superadmin, `ALL` semantics).
3. Device auth: `x-scanner-id` + `x-scanner-key` (sha256) or gym `pushSecret`; disabled-device 403; unscoped-by-gym semantics to be re-decided.
4. Ingestion: `POST /events` (array or `{events|transactions}`), `POST /heartbeat`; update `status/lastSeen/lastEventAt`.
5. Event pipeline exact order: dedupe → not-matched → member resolution → eligibility → check-in/late/checkout/duplicate, each permanently logged to `ScannerEvent` with `allow|deny` + reason + raw; idempotency via `deviceEventId` and unique `{gymId,member,date}`.
6. Attendance list API matching `history` scoping/pagination/population and `getAttendance` client params (page/limit/search/status/date/branchCode).
7. Timezone-correct `YYYY-MM-DD` dates (IST default) and 09:00 late threshold; resolve the server-clock inconsistency deliberately.
8. Response envelope + AppError status codes as §15.
9. Decide explicitly on: event-viewer API, member biometrics enrollment UX, `enforceMembership` semantics, device rate-limiter, and whether to include any scanner UI in the React.js client.

---

## 21. Final Notes
- Admin actions confirmed against database writes: create (insert doc w/ hash + plaintext return), update (whitelisted fields), disable (status flip, no delete), rotate (hash replace), sync (read members + touch `lastSync`).
- No source files created, modified, or deleted during this investigation.
- Everything above was verified from source; items that could not be fully proven (live device behavior, env values like `DEVICE_PUSH_SECRET`) are flagged in the text.

---

## Verification Checklist
- [x] Read all RN scanner screens + both drawers + navigation registration
- [x] Read `api/scanners.ts`, `api/attendance.ts`, `api/members.ts` (biometrics function confirmed unused)
- [x] Read mock provider + data + prototype screens (confirmed Admin-only, explicit "UI prototype")
- [x] Read scanner routes/controller/events controller/service/middleware + all 3 models
- [x] Read attendance routes/controller/model + utils (membership, date, deviceKey)
- [x] Read auth middleware (`authorize`, `adminOnly`, `checkPlanAccess`, `protectOptional`) + branchScope middleware
- [x] Read server.js mounting, rate-limit skip, CORS, socket.io
- [x] Read all 3 scanner test files (permissions, service, utils) as contract evidence
- [x] Admin and Superadmin analyzed separately; events vs attendance separated
- [x] Everything traced to DB where applicable; unprovable env/device facts flagged
- [x] No source files created/modified/deleted