# A1 FITNESS — ATTENDANCE FEATURE AUDIT

**Project:** A1 Fitness React Native app (Expo / React Native / TypeScript frontend + Node.js/Mongoose backend)
**Audit date:** 19 Sep 2026
**Scope:** Attendance feature as built. Investigation-only — **no code was modified**.
**Goal:** Source-of-truth reference for a future fresh React.js implementation.

---

## 1. Overview

The Attendance feature consists of **two read-only dashboard screens** plus a rich backend.

| Piece | Purpose |
|---|---|
| `SuperadminAttendanceScreen.tsx` | Full attendance list: search + date filter + **branch filter** + KPI cards + pagination. |
| `AdminAttendanceScreen.tsx` | Branch-scoped attendance list: search + date filter only + **Scanner Integration entry card**. No branch filter (back end scopes to the admin's branch). |
| `src/api/attendance.ts` | API client (list, by-id, check-in, check-out, update, delete) + type definitions. |
| `server/.../attendance.*` | Model, routes, controller. Hard authorization + branch scoping + trainer isolation + audit logs + soft delete. |

Neither admin screen **creates, edits, or deletes** attendance records — the list is display-only. The record-action API surface (PUT/DELETE) exists in the client library but is **not wired to any UI** in the app. All write paths currently live in the **member-facing self check-in/out flow** and the **secret-code/admin `POST /mark`** endpoint, which these screens do not exercise.

**Design language:** dark theme (`#0a0b10` screen background), card-based list, purple accent (`#8b5cf6`), 2×2 KPI grid, bottom-sheet date/branch pickers, purple avatar with member initials.

---

## 2. Files Inspected

Frontend:

- `src/screens/SuperadminAttendanceScreen.tsx` (748 lines) — full read.
- `src/screens/AdminAttendanceScreen.tsx` (562 lines) — full read.
- `src/api/attendance.ts` (164 lines) — full read.
- `src/api/branches.ts` — branch list source (verified previously; returns `{ branchCode, name, ... }`).
- `src/api/client.ts` — verified previously (`api.request<T>` unwraps `{ success, message, data }`).
- `src/components/SuperadminHeader.tsx` — verified previously (hamburger + title/subtitle + optional `right` slot).
- `src/components/drawer/DrawerContext.tsx` (drawer key `'Attendance'`), `SuperadminDrawer` / `AdminDrawer` (Attendance entry) — verified previously.
- `src/navigation/types.ts` & `src/navigation/index.tsx` — `ScannerIntegration: undefined` route exists and is registered; `SuperadminAttendance` / `AdminAttendance` drawer routes.
- `src/theme/colors.ts` — verified previously (token table below).
- `src/screens/ScannerIntegrationScreen.tsx` — target of the Admin scanner card (existence/location confirmed; not deeply audited this session).

Backend:

- `server/routes/attendance.routes.js` (40 lines) — full read.
- `server/models/attendance.model.js` (118 lines) — full read.
- `server/controllers/attendance.controller.js` (1,047 lines) — full read.
- `server/middlewares/auth.middleware.js` (`protect`, `protectOptional`, `authorize`, `checkPlanAccess`) — verified previously; superadmin passes every `authorize()`.
- `server/middlewares/branchScope.middleware.js` — verified previously.
- `server/utils/response.js`, `server/utils/pagination.js`, `server/utils/asyncHandler.js`, `server/utils/appError.js`, `server/utils/date.js`, `server/utils/membership.js` — verified previously.

Image search: only app icons exist under `assets/` (`icon.png`, `splash-icon.png`, `favicon.png`, Android icons). **No attendance screenshot exists anywhere in the repository.**

---

## 3. File Inventory Table

| File | Lines | Kind | Change-risk |
|---|---|---|---|
| `src/screens/SuperadminAttendanceScreen.tsx` | 748 | Screen (SA) | invertible |
| `src/screens/AdminAttendanceScreen.tsx` | 562 | Screen (Admin) | invertible |
| `src/api/attendance.ts` | 164 | Client + types | invertible |
| `src/api/branches.ts` | — | Client (shared) | low |
| `src/components/SuperadminHeader.tsx` | — | Shared chrome | low |
| `src/components/drawer/{SuperadminDrawer,AdminDrawer,DrawerContext}.tsx` | — | Navigation | low |
| `src/navigation/types.ts` / `index.tsx` | — | Route registry | low |
| `src/screens/ScannerIntegrationScreen.tsx` | — | Linked screen (Admin) | low |
| `server/routes/attendance.routes.js` | 40 | Routes | medium |
| `server/models/attendance.model.js` | 118 | Model | medium |
| `server/controllers/attendance.controller.js` | 1,047 | Controller | high |

No dedicated `src/components/` component exists for attendance — all subcomponents (`AttendanceCard`, `KpiCard`, `FilterChip`, `DateSheet`, `BranchSheet`, status badge) are **local to each screen** and duplicated between the two screens.

---

## 4. Route & Navigation Audit

### Frontend routes

| Route name | Type | Params | Screen | Reached from |
|---|---|---|---|---|
| `SuperadminAttendance` | Drawer | `undefined` | `SuperadminAttendanceScreen` | SuperadminDrawer → "Attendance" |
| `AdminAttendance` | Drawer | `undefined` | `AdminAttendanceScreen` | AdminDrawer → "Attendance" |
| `ScannerIntegration` | Stack | `undefined` | `ScannerIntegrationScreen` | AdminAttendanceScreen scanner card (line 184) |

- Both screens call `setActive('Attendance')` on mount via `useDrawer()` (SA line 132, Admin line 76).
- `AdminAttendanceScreen` uses `useNavigation<NativeStackNavigationProp<AppStackParamList>>()` to `navigation.navigate('ScannerIntegration')`. The scanners screen is a full stack screen pushed over the drawer (verified: `Stack.Screen name="ScannerIntegration"` in `src/navigation/index.tsx:89`).
- No attendance route accepts query/params — all filtering is internal state (date, branch, search) and sent as query strings to the API.

### Backend routes (`server/routes/attendance.routes.js`)

| Method | Path | Auth | Handler | Notes |
|---|---|---|---|---|
| POST | `/mark` | `protectOptional` | `markAttendance` | Secret-code self check-in/out (geofenced) OR admin/trainer manual mark with `memberId` |
| (all below) | | `protect` + `branchScope` | | branch scoping applied |
| POST | `/check-in` | `authorize("member")` + `checkPlanAccess` | `memberCheckIn` | Member self check-in |
| POST | `/check-out` | `authorize("member")` + `checkPlanAccess` | `memberCheckOut` | Member self check-out (geofenced) |
| GET | `/me` | member | `getMyAttendance` | own history |
| GET | `/me/today` | member | `getTodayStatus` | cached today status |
| GET | `/me/stats` | member | `getMyStats` | month stats/streaks |
| GET | `/me/export` | member | `exportMyAttendance` | CSV/HTML (pdf) export |
| GET | `/me/realtime` | member | `getRealTimeStatus` | live status, 30s cache |
| GET | `/` | `authorize("admin","trainer")` | `history` | **used by both dashboard screens** |
| POST | `/face-verify` | `authorize("admin","trainer")` | `faceVerifyPlaceholder` | placeholder stub |
| POST | `/check-in` | `authorize("admin","trainer")` | `checkIn` | ← **shadowed, see Risks** |
| PATCH | `/check-out/:id` | `authorize("admin","trainer")` | `checkOut` | admin/trainer checkout |
| PUT | `/:id` | `authorize("admin","superadmin")` | `updateAttendance` | update status/notes/times |
| DELETE | `/:id` | `authorize("admin","superadmin")` | `deleteAttendance` | soft delete |

**Route-shadowing finding (Important):** the member route `POST /check-in` (line 25) is declared **before** the admin `POST /check-in` (line 35) on the same path. Since `authorize("member")` throws a 403 when the caller is an admin/trainer, the admin/trainer handler at line 35 is **unreachable** — any non-member hitting `POST /check-in` gets 403 before the second middleware chain runs. The admin flow is served by `POST /mark` with a `memberId` instead. (Neither dashboard screen calls either endpoint.)

---

## 5. Role & Permission Trace

Middleware chain on admin endpoints: `protect` → `branchScope` → `authorize(...)` → controller.

- `protect`: Bearer JWT; inactive user → 403.
- `branchScope` (non-superadmin): forces `req.user.branchCode` to the user's branch (fallback `"MAIN"`); superadmin reads `req.query.branchCode` (default `ALL`).
- `authorize(...roles)`: rejects with 403 if the user's role is not in the list; **superadmin bypasses all `authorize()` checks** (verified in `auth.middleware.js`).

Per-endpoint effective access:

| Endpoint | admin | superadmin | trainer | member |
|---|---|---|---|---|
| GET `/` (history) | ✅ own branch | ✅ all/selected branch | ✅ own branch + own members only | ❌ |
| POST `/check-in` (line 35) | ❌ unreachable (403) | ❌ unreachable (403) | ❌ unreachable (403) | ✅ member route |
| PATCH `/check-out/:id` | ✅ own branch | ✅ any | ✅ own branch + own members | ❌ |
| PUT `/:id` | ✅ own branch | ✅ any | ❌ | ❌ |
| DELETE `/:id` | ✅ own branch | ✅ any | ❌ | ❌ |
| POST `/mark` | ✅ manual | ✅ manual | ✅ own members only | ✅ secret code |

Branch scoping in the controller (`history`, `updateAttendance`, `deleteAttendance`, `checkOut`):
- Non-superadmin branch is derived from `req.user.branchCode` and matched against the **member's current branch** (`Member.find({ branchCode }).distinct('_id')`) in `history`, and against `attendance.branchCode || member.branchCode` for record-level ops. Attendance "follows" a member if they are reassigned to another branch (comment at controller lines 784-787).
- Trainer isolation: trainers only see/operate members where `member.trainer === req.user._id` (403 otherwise) — enforced in `history`, `checkIn`, `checkOut`, `markAttendance`.
- Superadmin: branch filter is a query param; `"ALL"`/`"all"` = no scoping; a supplied branch validates against the member's current branch on write ops (400 mismatch).

**Member-facing endpoints** (`/me*`, self check-in/out) are gated additionally by `assertMemberEligible` (active membership) and `checkPlanAccess`. These are NOT used by the two dashboard screens — included for completeness of the feature.

---

## 6. Package & Library / Feature Inventory

No attendance-specific third-party dependency. The feature uses only core RN primitives:

| Capability | Source |
|---|---|
| UI primitives | `react-native` `View/Text/TouchableOpacity/TextInput/FlatList/Modal/ScrollView/ActivityIndicator/RefreshControl/StyleSheet` |
| Safe areas | `react-native-safe-area-context` `SafeAreaView` (edges top+bottom) |
| Navigation (Admin → scanner) | `@react-navigation/native` `useNavigation` + native-stack types |
| Drawer active state | custom `useDrawer()` context |
| HTTP | internal `api.request` (auth: true → bearer token) in `client.ts` |
| Backend | Express + Mongoose; Socket.IO ack events (`attendance:update` / `attendance:checkin` / `attendance:checkout`); Redis-backed `cache.service` for today-status cache |

**Notable:** no date-picker library (custom 30-day bottom sheet), no icon library (text glyphs `↻ ⚠ ◎ ▾ › ▰ ▸ ▾ ▹`), no status filter UI, no infinite-scroll library (manual `onEndReached` + Load More).

## 7. UI Type & Component Analysis

### SuperadminAttendanceScreen (748 lines) — composition

```
SafeAreaView (bg #0a0b10)
├─ SuperadminHeader  title="Attendance"  subtitle="Today · Sat, 19 Sep 2026"  right=RefreshBtn(↻)
├─ SearchInput         placeholder "Search member..."   (debounced 500ms)        [show sar..]
├─ FilterRow
│  ├─ FilterChip        date chip   ("Today"/"Yesterday"/"19 Sep" + ▾)
│  └─ FilterChip        branch chip ("All Branches" or branch name + ▾)
├─ Load gate           initial spinner | full error (⚠ + Retry) | FlatList
│  FlatList:
│  ├─ ListHeader
│  │  ├─ ErrorBanner    (only when error && records exist)
│  │  ├─ KpiRow #1      Total | Present
│  │  ├─ KpiRow #2      Late  | Completed
│  │  ├─ KpiNote        "Counts from the X of Y records shown."
│  │  └─ ListTitle      "Attendance Records (total)"
│  ├─ AttendanceCard    per row (memoized)
│  ├─ ListEmpty         ◎ + "No attendance found" + sub + Reset filters (if filters active)
│  └─ ListFooter        Load More button | End of list
├─ DateSheet            Modal bottom-sheet (last 30 days)
└─ BranchSheet          Modal bottom-sheet (All Branches + branch list)
```

### AdminAttendanceScreen (562 lines) — same skeleton minus branch filter, plus scanner card

```
SafeAreaView (bg #0a0b10)
├─ SuperadminHeader  title="Attendance"  subtitle="Members marked present today"  right=RefreshBtn
├─ ScannerEntryCard   purple card → navigate('ScannerIntegration')  ("Scanner Integration / Manage Scanners · Connect Scanner" ▸ ›)
├─ SearchInput         placeholder "Search member..."  (debounced 500ms)
├─ FilterRow   FilterChip(date)  +  static text "Your branch only"
├─ Load gate           initial spinner | full error (⚠ + Retry) | FlatList
│  FlatList:
│  ├─ ListHeader       KpiRow Total|Present ; KpiRow Late|Completed ; "Records (total)"
│  ├─ AttendanceCard   (avatar, name, phone, status badge, Check-in, Check-out, Source?)
│  ├─ ListEmpty        ◎ + "No attendance found" (+ filters-aware subtitle, NO reset button)
│  └─ ListFooter       Load More | End of list
└─ DateSheet           Modal bottom-sheet (last 30 days)
```

### Local components (defined inside each screen file, duplicated)

| Component | SA screen | Admin screen | Purpose |
|---|---|---|---|
| `AttendanceCard` | ✓ (no Source row, has Branch + Duration) | ✓ (has Source row, no Branch/Duration) | record row |
| `KpiCard` | ✓ | ✓ | KPI cell |
| `FilterChip` | ✓ | ✓ | filter pill |
| `DateSheet` | ✓ | ✓ | date bottom sheet |
| `BranchSheet` | ✓ | ✗ | branch bottom sheet |
| `AttendanceStatusBadge` | ✓ (sub-component) | ✗ (inlined) | status pill |
| `ErrorBanner`, `EmptyBox`, `resetFilters` | ✓ | ✗ / partial | error/empty handling |

> **Reuse note:** SA and Admin screens share ~70% identical code (state machine, fetch, pagination, cards, sheets). Strong candidate to collapse into one parameterized component (`<AttendanceDashboard role="superadmin|admin" />`) in the React.js rebuild.

### Status color mapping (both screens)

```ts
STATUS_COLORS = {
  present: colors.success,      // #2EB872
  completed: '#2ecc71',         // hard-coded green
  late: '#f59e0b',              // amber
  'half-day': '#a855f7',        // purple
  absent: colors.danger,        // #E5484D
}   // unknown status → colors.textMuted
```

---

## 8. State Matrix (18 states)

Both screens implement the same `LoadingMode = 'initial' | 'refresh' | 'loadMore' | 'idle'` machine with request-race protection (`reqIdRef`). SA additionally tracks branch + filter-reset; Admin tracks scanner navigation.

| # | State | Trigger | UI observed |
|---|---|---|---|
| 1 | **Initial load** | mount (`mode='initial'`) | centered `ActivityIndicator` + "Loading attendance…" |
| 2 | **List ready** | fetch success | FlatList + KPIs + records |
| 3 | **Pull-to-refresh** | `RefreshControl` (mode='refresh') | spinner in refresh control, `tintColor=colors.accent` |
| 4 | **Header refresh** | ↻ button (disabled when mode!=='idle') | refetches page 1 |
| 5 | **Full error (no data)** | error && list empty | centered ⚠ + message + Retry button |
| 6 | **Partial error (data present)** | error && list non-empty | red ErrorBanner (SA only) + Retry link; Admin shows none |
| 7 | **Load more** | `onEndReached` (threshold 0.4) or button | footer spinner → appended records |
| 8 | **End of list** | `attendance.length >= total` | "End of list" text |
| 9 | **Empty (no filters)** | empty && !hasActiveFilters | ◎ "No attendance found" / Admin: "…for this date yet." |
| 10 | **Empty (filters active)** | empty && hasActiveFilters | + "Try another date, branch, or search." + Reset filters (SA only) |
| 11 | **Search typing** | searchQuery changes | debounce 500ms before firing |
| 12 | **Search applied** | searchTerm committed | refetch page 1 |
| 13 | **Date sheet open** | tap date chip | slide-up Modal, 30 options |
| 14 | **Branch sheet open** | tap branch chip (SA) | slide-up Modal, ALL + branches |
| 15 | **Non-today date selected** | DateSheet select | chip shows day label; header subtitle "Today · …" only when today |
| 16 | **Branch = ALL vs specific** | BranchSheet select (SA) | ALL → param omitted; specific → `branchCode=` sent |
| 17 | **Request superseded** | stale response arrives | dropped via `reqIdRef` mismatch |
| 18 | **Refresh button disabled** | mode !== 'idle' | ↻ greyed (opacity/disabled) |

**Filter triggers refetch (page 1):** date, debounced search, and branch each change `fetchData` dependencies → effect reruns (first run `'initial'`, subsequent `'refresh'`).

---

## 9. Data Flow & API Contract

### Request flow (both screens)

1. On mount: `getBranches()` (SA only, best-effort: `.catch(() => {})`) and initial `getAttendance(...)`.
2. `getAttendance({ date, search?, branchCode?, page, limit:20 })` (default `limit` 20; `status` never sent by either screen).
3. `buildAttendanceQuery` URL-encodes params; skips `status: 'all'` and `branchCode: 'ALL'`.
4. `api.request('/attendance?...', { auth: true })` → server `GET /attendance` (`history`).
5. Response unwrapped to `{ items, page, limit, total }` (defaults `[]/1/20/0`).
6. On success: replace list (page 1) or append (`loadMore`); `setTotal(res.total)`.
7. On error: set `error` (message from thrown Error); non-loadMore errors surface in UI.

### Client API surface (`src/api/attendance.ts`)

| Function | HTTP | Body/Params | Returns |
|---|---|---|---|
| `getAttendance(params)` | GET `/attendance` | page, limit, search, status, date, branchCode | `AttendancePage` |
| `getAttendanceById(id)` | GET `/attendance/:id` | — | `AttendanceItem` |
| `checkInAttendance({member, branchCode?})` | POST `/attendance/check-in` | JSON body | `AttendanceItem` |
| `checkOutAttendance(id)` | PATCH `/attendance/check-out/:id` | `{}` | `AttendanceItem` |
| `updateAttendance(id, params)` | **PUT** `/attendance/:id` | status, notes, checkIn, checkOut | `AttendanceItem` |
| `deleteAttendance(id)` | DELETE `/attendance/:id` | — | void |

> **Only `getAttendance` is used by the two screens.** The CRUD/check-in helpers are defined but unwired (reserved for future / member app).

### Server response contract

- Success (via `sendResponse`): `{ success: true, message, data }` — `data = { items[], page, limit, total }` for history.
- Error (via error middleware): `{ success: false, message, code, data }` with HTTP 400/403/404.
- `history` shape: items populated `member → user {name, email, phone}`; each item is the full Attendance doc (fields per model, incl. `auditLogs`).

### `history` server semantics (controller lines 771-824)

```
query = { gymId: req.gymId, deletedAt: null }
if (date) query.date = date                     // exact string match
branch scope: non-superadmin → memberIds of own branch (current branchCode)
              trainer → + member.trainer = req.user._id
              superadmin → req.query.branchCode unless "ALL"/"all"
search: new RegExp(search,'i') on member.user.name only (NOT phone/email)
sort:   { createdAt: -1 }
paging: getPagination(page≥1, limit≤100)
```

### Status → meaning (traced to controller)

| status | produced when |
|---|---|
| `present` | checked in before 09:00 and not yet checked out (default on record creation) |
| `late` | checked in at hour ≥ 9 (`LATE_THRESHOLD_HOUR = 9`), or checked out after late check-in (late preserved) |
| `completed` | checked out **after** a `present` (on-time) check-in; also **forced** by admin `checkOut` (regardless of lateness) |
| `absent` | never stored; synthesized only (`/me/today`, stats, daily breakdown) |
| `half-day` | **never produced by any code path** in this controller; only counted in stats; settable only via PUT `/:id` free-form `status` |

**Status-flow gotcha:** a `late` record checked out via the member flow **stays `late`** (controller lines 171-175 comment: "Preserve late status"). But the admin `checkOut` handler (line 888) **always** overwrites to `completed`. Inconsistent semantics — flag for the rebuild.

---

## 10. Component Hierarchy (render tree as implemented)

```
AppStack / Drawer
└── SuperadminAttendanceScreen  |  AdminAttendanceScreen
    ├── SafeAreaView(edges top,bottom)
    │   ├── SuperadminHeader(attendance)
    │   ├── [Admin] ScannerEntryCard → navigation.navigate('ScannerIntegration')
    │   ├── TextInput(search)
    │   ├── FilterChip(date) (+ [SA] FilterChip(branch) | [Admin] 'Your branch only')
    │   ├── Mount/error gates
    │   │   ├── initial → ActivityIndicator
    │   │   ├── error && empty → ErrorState(⚠, Retry)
    │   │   └── FlatList
    │   │       ├── ListHeader → KpiCards + [SA ErrorBanner]
    │   │       ├── AttendanceCard(memo) × N
    │   │       ├── EmptyState
    │   │       └── Footer(Load More / End of list)
    │   └── Modal(DateSheet) (+ [SA] Modal(BranchSheet))
    └── children of sheets: ScrollView > rows
```

`AttendanceCard` (SA) renders: avatar (initials, 44px circle) · name (single-line) · phone · status badge (dot + text) · rows: Branch / Check-in / Check-out / Duration (conditional).
`AttendanceCard` (Admin) renders: avatar · name · phone · status badge · rows: Check-in / Check-out / Source (conditional).

## 11. Styling & Theming (Theme & Token Analysis)

All tokens come from `src/theme/colors.ts` (verified previously); a handful of values are hard-coded inline.

| Token | Value | Used for |
|---|---|---|
| `colors.background` | `#0B0E11` | (screen uses hard-coded `#0a0b10` instead) |
| screen bg (hard-coded) | `#0a0b10` | `container` both screens |
| `colors.surface` | `#151A20` | cards use `rgba(30,32,44,0.6)` instead |
| card bg (hard-coded) | `rgba(30,32,44,0.6)` | KPI card, attendance card, load-more button |
| card border (hard-coded) | `rgba(255,255,255,0.08)` | cards, refresh button |
| sheet bg (hard-coded) | `#13161d` | bottom-sheet body |
| `colors.primary` | `#E11D2E` | Completed KPI value, danger accents |
| `colors.accent` | `#8b5cf6` | spinner, avatar, "Total" KPI, refresh glyph, selected sheets, reset/load-more text |
| `colors.success` | `#2EB872` | "Present" KPI |
| `colors.danger` | `#E5484D` | absent status, error banner text |
| `colors.text` | `#FFFFFF` | titles, names, values |
| `colors.textMuted` | `#9AA7B4` | labels, secondary text, sheet options |
| `colors.textFaint` | `#6B7785` | hints, meta, placeholders |
| `colors.inputBackground` | `#14181E` | search input, filter chips |
| `colors.border` | `#2A333D` | search input + chip borders |
| Hard-coded | `#2ecc71` | completed badge |
| Hard-coded | `#f59e0b` | late (KPI + badge), scanner card is purple `rgba(139,92,246,…)` |
| Hard-coded | `#a855f7` | half-day badge |

**Style architecture:** `StyleSheet.create` per screen; two screens duplicate style keys 1:1 (only additions differ: SA = `errorBanner/errorBannerText/errorBannerRetry/kpiNote/resetButton/resetButtonText`; Admin = `scannerEntry*`, `branchHint`, no reset/error-banner). No style library, no shadows (`elevation` absent), no gradients.

### Design tokens → hard-coded quirks (watch in rebuild)

- Screen bg `#0a0b10` ≠ token `colors.background` (`#0B0E11`) — near-identical but not the token.
- Cards `rgba(30,32,44,0.6)` vs `colors.surface` `#151A20` — the RN code actually uses the inline rgba.

---

## 12. Screenshot-to-Code Audit

**Not confirmed in the available source.** No screenshot image file is present anywhere in the workspace (glob of `assets/` and `src/` returned only app icons: `icon.png`, `splash-icon.png`, `favicon.png`, `android-icon-*.png`). Every claim below therefore relies on the prompt's textual description mapped onto code.

| Screenshot element (described) | Code equivalent | Match |
|---|---|---|
| Dark dashboard header "Attendance" + date | `SuperadminHeader` title + `formatHeaderDate` ("Today · Sat, 19 Sep 2026") | ✅ matches description |
| Search bar with placeholder | `TextInput` placeholder "Search member..." | ✅ |
| Date / branch filter pills | `FilterChip` (`label ▾`) — date + branch (SA) / date only (Admin) | ✅ (Admin has no branch pill) |
| KPI cards row | `KpiRow` (`Total/Present`, `Late/Completed`) | ✅ 2×2 layout |
| Purple record rows w/ avatar + status chip | `AttendanceCard` (purple circle avatar, `.statusBadge`) | ✅ |
| Summary "X of Y records shown" | `kpiNote` string | ✅ |
| End-of-list "Load More" | footer button / `End of list` | ✅ |

**Cannot be confirmed:** exact spacing, exact colors of specific chips in the described image, presence/absence of a "Scanner Integration" card on the described Admin mockup, any visual state (empty/search result styling) of the image. Where the description conflicts with code (e.g., admin screenshot showing a branch filter that does not exist in `AdminAttendanceScreen`), code is authoritative.

---

## 13. Table Reuse & Componentization Map

The feature has **no reusable/table component** today — it is a FlatList of memoized cards. For the React.js port, the duplication split across the two screens decomposes into a single reusable kit:

| Proposed React.js component | Sourced from (implemented in) | Reused by |
|---|---|---|
| `AttendanceDashboard` (role param) | merge both screens | Admin + Superadmin pages |
| `SearchField` (debounce 500ms) | SA 150-173 / Admin 91-103 | both |
| `FilterChip` | both (duplicated) | both |
| `DatePickerSheet` (30 days) | SA 469-512 / Admin 358-399 | both |
| `BranchPickerSheet` | SA 514-564 | superadmin only |
| `KpiGrid` (Total/Present/Late/Completed) | both (duplicated) | both |
| `AttendanceCard` | SA 422-465 / Admin 318-356 | both (Admin variant drops Branch/Duration, adds Source) |
| `StatusBadge` | SA 117-125 / Admin inlined 335-338 | both |
| `ErrorBanner` / `EmptyState` / `LoadMoreFooter` | SA 622-677 | superadmin (Admin uses lighter variants) |
| `ScannerEntryCard` | Admin 403-429 | admin page (+ header chevron) |

---

## 14. Feature Walk-Through — Superadmin

1. **Enter:** SuperadminDrawer → "Attendance" → `SuperadminAttendanceScreen`, `setActive('Attendance')`.
2. **Mount:** loads SA branches (`.catch(()=>{})`) + initial list for today, all branches: `GET /attendance?date=<today>&limit=20`. Header shows "Today · <full date>"; subtitle updates only when a different date is selected.
3. **KPI cards:** counts computed **client-side** from currently loaded records only (see Risks #1). `kpiNote` discloses: "Counts from the X of Y records shown."
4. **Search:** typing triggers 500ms debounce → refetch page 1 with `search=` (backend regex on member name only).
5. **Date filter:** date chip → `DateSheet` (last 30 days: Today/Yesterday/<weekday, day, month>) → refetch with `date=YYYY-MM-DD`.
6. **Branch filter:** branch chip → `BranchSheet` ("All Branches" + list from `getBranches`) → refetch with `branchCode=` (omitted when ALL).
7. **Scrolling:** `onEndReached`/Load More appends page N+1 (limit 20) until `length >= total` → "End of list".
8. **Errors:** full-page ⚠+Retry when nothing loaded; red banner when partial. **Refresh:** pull-to-refresh, ↻ button, or Retry.
9. **Empty:** "No attendance found" + contextual hint + **Reset filters** button (restores today/ALL/empty search).
10. **No record actions** exist in this screen — it is purely observational.

## 15. Feature Walk-Through — Admin

1. **Enter:** AdminDrawer → "Attendance" → `AdminAttendanceScreen`, `setActive('Attendance')`; header subtitle is the static string "Members marked present today".
2. **Scanner card:** tapping jumps via stack navigation to `ScannerIntegrationScreen` ("Manage Scanners · Connect Scanner"). Not part of this audit's scope beyond navigation.
3. **Mount:** fetches list for today **scope-limited server-side** to the admin's branch (`branchScope` + `history` member-current-branch match). **No branch UI** — the row shows the static hint "Your branch only".
4. **KPI cards:** identical 2×2 grid; same client-side caveat; no "counts shown" caption.
5. **Search / date filter:** identical to SA (debounce + 30-day sheet); refetch page 1.
6. **Records:** cards show Check-in / Check-out / **Source** (e.g., `app`, `admin`, `trainer`, `scanner`, `secret_code`) in place of SA's Branch + Duration rows.
7. **Errors/loading:** initial spinner + full Retry; **no partial-error banner**; pull-to-refresh + ↻.
8. **Empty:** "No attendance found" + "No members have marked attendance for this date yet." / "Try another date or search." — **no Reset filters button**.
9. Admin cannot see or operate on other branches through this screen; write endpoints exist in the API client but no UI calls them.

## 16. Role & Access Matrix

| Capability | Superadmin | Admin | Trainer | Member |
|---|---|---|---|---|
| View attendance list (GET /) | ✅ all or per-branch | ✅ own branch | ✅ own branch, own assigned members only | ❌ (own `/me` list) |
| Branch filter dropdown | ✅ (BranchSheet) | ❌ static "Your branch only" | ❌ | ❌ |
| Search members | ✅ | ✅ | ✅ (name-only server-side) | – |
| Date filter | ✅ | ✅ | ✅ | – |
| KPI summary cards | ✅ (client-side) | ✅ (client-side) | (list only) | – |
| Manually set status / notes / times (PUT /:id) | ✅ any branch | ✅ own branch | ❌ | ❌ |
| Soft-delete record (DELETE /:id) | ✅ any branch | ✅ own branch | ❌ | ❌ |
| Check-out member record (PATCH /check-out/:id) | ✅ any | ✅ own branch | ✅ own members | self only |
| Check-in member (POST /check-in) | (route shadowed — use /mark) | (route shadowed) | (route shadowed) | ✅ self |
| Manual mark via secret code | through `/mark` | through `/mark` | own members only | self |

**UI/role parity gap:** The member-facing features (self check-in/check-out, stats, streaks, CSV/PDF export, realtime status, secret-code `/mark`, geofencing) are complete in the backend but have **zero UI in this RN app's admin/superadmin dashboards**.

## 17. Validation & Edge Cases

**Client-side:**
- Search trimmed before sending; debounce re-armed on every keystroke and cleared on unmount.
- `messageFrom(err, fallback)` — non-Error thrown values fall back to a default message.
- Empty/absent dates (`null`/invalid ISO) render "—" for times; duration only when `checkOut > checkIn`.
- `initials()` handles empty/whitespace names → "?"; SA card falls back to "Unknown member"; Admin card `(name[0] ?? '?')`.
- Branch display falls back to raw `branchCode` when the branch list lookup fails.
- `onEndReached` guarded against double-fetch (`mode !== 'idle'`, `length ≥ total`).

**Server-side (controller):**
- Missing/late dates, already-checked-out, no-record-yet, duplicate same-day (unique index) → 400s with clear messages.
- Branch isolation returns **404** (not 403) for cross-branch record access ("not found in your branch") — deliberate information-hiding.
- Trainer isolation returns 403.
- `checkIn` (admin) creates a record **without setting `checkIn`** (only populates member/date/branch) — the time stays `null` until checkout/update. **Edge: status stays default `present` with no check-in timestamp** (likely a latent bug; see Risks #2).
- `updateAttendance` accepts free-form `status` (no whitelist beyond Mongoose enum — invalid strings throw a Mongoose validation error mapped to 400/500 by the error middleware).
- Pagination caps `limit` at 100 server-side; client always sends 20.

## 18. Visual Spec & Measurements (concrete values)

All values verified from the two screens' `StyleSheet`.

**Layout / spacing**
- Screen horizontal padding: `20px` everywhere (`listContent`, `searchWrap`, `filterRow`). Cards stack with `marginBottom: 12-16`.
- Header: title 22/800 white; subtitle 13 `textMuted`; refresh button 36×36, r10, bg `rgba(30,32,44,0.8)`, 1px border `rgba(255,255,255,0.08)`, glyph "↻" 18 accent bold.
- Search input: height 46, r12, bg `inputBackground`, 1px border `border`, horizontal padding 14, text 14.
- Filter chips: flex row `gap: 8`; chip `flex:1`, r12, bg `inputBackground`, border 1px, padding 12×9, text 13/600 `textMuted`, trailing "▾".
- Filter row (Admin): chip `flex:1` + `branchHint` 12 `textFaint` ("Your branch only").

**KPI cards**
- Cell `flex:1`, bg `rgba(30,32,44,0.6)`, 1px border `rgba(255,255,255,0.08)`, r14, padding 14; row gap 8, `marginBottom 8`; 2 rows (2×2 grid).
- Label 12/600 uppercase `textMuted`; value 22/800 colored (`Total` accent, `Present` success, `Late` #f59e0b, `Completed` primary #E11D2E).
- SA note: 12 `textFaint`. Title "Attendance Records (N)" 18/800 white (Admin: "Records (N)").

**Attendance card**
- bg `rgba(30,32,44,0.6)`, border `rgba(255,255,255,0.08)`, r16, padding 14, `marginBottom 12`.
- Avatar 44×44 circle, bg `rgba(139,92,246,0.25)`, 1px border `rgba(139,92,246,0.5)`, glyph 16/800 accent, `marginRight 12`.
- Name 16/700 white (single line); meta (phone) 12 `textFaint`; status badge pill: border 1px `statusColor`, r999, padding 10×4, dot 6×6 r3, text 11/700 uppercase colored.
- Detail rows: 13px, label fixed `width: 80`, `gap: 12`, `marginBottom 6`; duration (SA) 13/700 accent.

**Bottom sheets**
- Body bg `#13161d`, top r24, padding `20/18/28`, `maxHeight: 62%`, title 18/800.
- Backdrop `rgba(0,0,0,0.55)`; option rows padding 14, r12; selected = border + bg `rgba(139,92,246,0.15)`, text accent/700.
- Options (SA): label 15/600 `textMuted` left, sub-label 12 `textFaint` right (branch sheet → sub = `branchCode`).

**Scanner card (Admin)**
- bg `rgba(139,92,246,0.12)`, 1px border `rgba(139,92,246,0.4)`, r16, padding 12, margins `20/0/12`; icon circle 40 r20 purple-mirror; title 15/700, sub 12 `textFaint`, chevron "›" 22 accent.

## 19. Responsive Layout & Adaptive Design

- **Fluid widths:** all rows use `flex: 1` cells; horizontal padding fixed at 20 on all devices (no responsive breakpoints; no `useWindowDimensions`/media queries).
- **Portrait phone assumption:** 2-across KPI grid and chip row rely on ≥320px width; very narrow screens may crowd the two chips (each `flex:1` with `flexShrink:1` on text, `numberOfLines={1}` truncates).
- **Landscape/tablet:** unchanged layout (stretches full width); `maxHeight: '62%'` sheets scale by container; no tablet-specific presentation.
- **Locale/time:** formatting uses `en-IN` locale everywhere (`toLocaleDateString('en-IN', …)`), 24h time; backend dates are **strings** `YYYY-MM-DD`; `today` computed client-side via local time `toDateParam(new Date())`.
- **Loaded-per-page sensitivity:** KPI/grid + "End of list" adapt to `total`/`length`.

## 20. Accessibility & UX

Current state (RN):

- **Touch targets:** chips/search rows ≥ 44px tall; refresh button is only 36×36 (below the recommended 44px). Retry/reset/load-more exceed 44px.
- **Labels/A11y:** no `accessibilityLabel`, `accessible`, or roles on **any** control; glyph-only buttons (↻) are invisible to screen readers. Not-conformance: **significant gap for the rebuild** (`aria-label`/accessible alternative required).
- **Color contrast:** text `#FFFFFF`/`#9AA7B4` on `#0a0b10` is strong; accent purple `#8b5cf6` on dark meets ~7:1; amber `#f59e0b` and `#2ecc71` pass on dark. Status color is **not** the sole signal (dot + uppercase text) — good.
- **Reduced motion:** slide-in sheets cannot be disabled; no `accessibilityLiveRegion` for loads.
- **Feedback:** pull-to-refresh + ↻ disabled while loading; Load More shows spinner; error/empty states are explanatory; race-condition drops prevent flicker.
- **Keyboard (web port):** `TextInput` has `autoCapitalize="none"`, `autoCorrect={false}`; but no Enter-to-search, no focus styling, debounce delay visible. Emoji/text glyphs (↻ ⚠ ◎ ▾ › ▰) render inconsistently on some web fonts — replace with icon component in the React.js port.

## 21. React.js Component Blueprint (Recommended for the port)

Collapse both screens into one parameterized `AttendanceDashboard` plus a reusable kit:

```
src/features/attendance/
├─ AttendanceDashboard.tsx        role: 'superadmin' | 'admin'
│    state: useAttendanceData() hook
├─ components/
│  ├─ SearchField.tsx             debounced 500ms, aria-label "Search member"
│  ├─ FilterChip.tsx              date/branch pills (role-dependent)
│  ├─ DatePickerSheet.tsx         30-day list (Today/Yesterday/weekday labels)
│  ├─ BranchPickerSheet.tsx       superadmin only (ALL + branches)
│  ├─ AttendanceCard.tsx          avatar/name/phone/badge; role-driven rows (Branch/Duration vs Source)
│  ├─ StatusBadge.tsx             shared pill (present/completed/late/half-day/absent + fallback)
│  ├─ KpiGrid.tsx                 Total/Present/Late/Completed
│  ├─ LoadErrorState.tsx          full error + Retry
│  ├─ ErrorBanner.tsx             inline partial error (superadmin)
│  ├─ EmptyState.tsx              + ResetFilters (superadmin)
│  └─ LoadMoreFooter.tsx          Load More / End of list
└─ api.ts                         getAttendance + types (port 1:1)
```

Suggested props for `AttendanceDashboard`:
- `role: 'superadmin' | 'admin'`
- `headerRight?: ReactNode` (refresh control internal)
- superadmin-only: `branchFilter`, `resetFilters`, `errorBanner`; admin-only: `scannerEntry`

## 22. React.js State Blueprint (Recommended)

```ts
// useAttendanceData.ts — mirror of the RN machine, cleaned up
type LoadingMode = 'initial' | 'refresh' | 'loadMore' | 'idle';

state = {
  mode: LoadingMode,
  error: string | null,
  items: AttendanceItem[],
  total: number,
  page: number,                       // last loaded page
  requestSeq: number,                 // race guard (was reqIdRef)
  dateFilter: string,                 // YYYY-MM-DD, default today
  branchFilter: string | 'ALL',       // superadmin only
  searchQuery: string,                // live input
  searchTerm: string,                 // committed (debounced 500ms)
  branches: BranchItem[],             // superadmin only
};

effects:
  - branches fetch on mount (best-effort)
  - debounce(searchQuery → searchTerm, 500ms)
  - refetch on [dateFilter, branchFilter, searchTerm] change
     (first run 'initial', subsequent 'refresh')
  - loadMore when onEndReached (guard: mode==='idle' && items.length < total)

KPI derivation (client-side, CURRENT-PAGE ONLY — mirror behavior, flag in UI):
  kpis = {
    total:    items.length,
    present:  items.filter(i => i.status === 'present').length,
    late:     items.filter(i => i.status === 'late').length,
    completed:items.filter(i => i.status === 'completed').length,
  }

server contract stays: { items, page, limit, total } with GET /attendance
query params: page, limit(20), search?, date, branchCode? (skipped when 'ALL')
```

## 23. Dummy Data Blueprint

```ts
export const branchOptions = [
  { value: 'ALL', label: 'All Branches', sub: 'Show attendance across all branches' },
  { value: 'BLR-CITY', label: 'City Center', sub: 'BLR-CITY' },
  { value: 'BLR-INDIRA', label: 'Indiranagar', sub: 'BLR-INDIRA' },
  { value: 'HYD-ONE',    label: 'One North',   sub: 'HYD-ONE' },
];

export const dummyAttendance: AttendanceItem[] = [
  {
    _id: 'att_1001',
    gymId: 'gym_main',
    date: '2026-09-19',
    checkIn: '2026-09-19T07:52:00+05:30',
    checkOut: '2026-09-19T09:30:00+05:30',
    status: 'completed',
    source: 'app',
    branchCode: 'BLR-CITY',
    member: { _id: 'mem_1', user: { name: 'Arjun Rao', phone: '98450 11223' }, branchCode: 'BLR-CITY' },
  },
  {
    _id: 'att_1002',
    gymId: 'gym_main',
    date: '2026-09-19',
    checkIn: '2026-09-19T09:10:00+05:30',
    checkOut: null,
    status: 'late',
    source: 'admin',
    branchCode: 'BLR-CITY',
    member: { _id: 'mem_2', user: { name: 'Meera Iyer', phone: '99860 44556' }, branchCode: 'BLR-CITY' },
  },
  {
    _id: 'att_1003',
    gymId: 'gym_main',
    date: '2026-09-19',
    checkIn: null,
    checkOut: null,
    status: 'absent',                 // synthetic — never stored server-side
    source: 'app',
    branchCode: 'HYD-ONE',
    member: { _id: 'mem_3', user: { name: 'Unknown member', phone: null }, branchCode: 'HYD-ONE' },
  },
  {
    _id: 'att_1004',
    gymId: 'gym_main',
    date: '2026-09-18',
    checkIn: '2026-09-18T07:10:00+05:30',
    checkOut: '2026-09-18T08:35:00+05:30',
    status: 'half-day',               // settable only via PUT /:id free-form
    source: 'scanner',
    scanner: { _id: 'scn_1', name: 'Gate Scanner', deviceId: 'GW-01' },
    branchCode: 'BLR-INDIRA',
    member: { _id: 'mem_4', user: { name: 'Rahul Verma', phone: '90000 77889' }, branchCode: 'BLR-INDIRA' },
  },
];

export const dateSheetOptions = [
  { value: '2026-09-19', label: 'Today',     sub: '19 Sep 2026' },
  { value: '2026-09-18', label: 'Yesterday', sub: '18 Sep 2026' },
  { value: '2026-09-17', label: 'Thu, 17 Sep', sub: '17 Sep 2026' },
];
```

## 24. Risks & Gotchas

**Required (must resolve in the port)**

- **R1 · KPI cards are client-side, current-page only.** `Total/Present/Late/Completed` count only the **loaded** records (`attendance.length`), not the server `total`. The caption "Counts from the X of Y records shown." acknowledges it, but a re-implementation that shows KPIs for a filtered subset without the caveat will mislead. Decide: server-side KPI endpoint, or keep caption.
- **R2 · Admin `checkIn` creates a record with `checkIn: null`** (controller lines 852-859). The record shows status `present` with no check-in time — inconsistent with the member flow, which stamps `checkIn` on create. If the port exposes admin check-in, it must set `checkIn = new Date()`.
- **R3 · `POST /check-in` route shadowing** (routes lines 25 & 35). The member route's `authorize("member")` 403s admins/trainers before the admin handler runs; the admin handler is dead code. Port the client only against `/mark` (or fix the server route path, e.g. admin `POST /admin/check-in`).
- **R4 · Timezone/date assumptions.** Backend `date` is a plain `YYYY-MM-DD` string matched with `===`; "today" is computed independently in client and server; member records store `timezone` (default Asia/Kolkata) but the admin list ignores it. Members near midnight / different TZ see date drift. Standardize on a single timezone in the port.

**Important (should resolve)**

- **I1 · `half-day` is unproducible** by any user flow; only settable via free-form PUT `status`. No UI generates it. Clarify intended semantics.
- **I2 · Status transitions are inconsistent between flows.** Member check-out preserves `late` ("present" only → `completed`); admin `checkOut` always overwrites to `completed`; `late` + admin checkout → `completed` despite lateness. Define one rule.
- **I3 · Search is name-only, server-side.** `new RegExp(search,'i')` against `member.user.name` (aggregate in `history`); phone/email are not searched. If the mock/search implies phone matching, it must be added to the aggregate or serialized in the API.
- **I4 · Sort is `createdAt: -1`**, not `checkIn` or `date`+`checkIn`. List ordering can diverge from intuitive time order (e.g. batch-imported records).
- **I5 · `status` filter param is a no-op in `history`.** The client API accepts `status` but the server ignores it. UI has no status filter — ensure the port doesn't rely on it without a server change.
- **I6 · Refresh button is 36×36** (below 44px target) and glyph-only; a11y labeling required in port.
- **I7 · Dark-screen background `#0a0b10` is hard-coded, not the `colors.background` token** — tokenize in the port.

**Optional**

- **O1 · Deduplicate screens** — SA/Admin share ~70% code; port as one parameterized dashboard.
- **O2 · Accessibility** — `aria-label`s, roles, focus management, Enter-to-search, `prefers-reduced-motion` respect for sheets.
- **O3 · Icons** — replace text glyphs (↻ ⚠ ◎ ▾ › ▰) with an icon library.
- **O4 · Locale** — `en-IN` formatting is hard-coded; make locale configurable.

## 25. Implementation Checklist (for the React.js port)

- [ ] Shared `AttendanceDashboard` with `role` prop; remove screen duplication.
- [ ] `api.ts` port of `getAttendance` + types; keep `{ items, page, limit, total }` contract.
- [ ] Debounced search (500ms) with committed-state semantics.
- [ ] Date filter via 30-day sheet (Today/Yesterday/weekday labels, `YYYY-MM-DD` value).
- [ ] Branch filter sheet (superadmin only), skips param when `ALL`.
- [ ] KPI 2×2 grid with per-page caveat (R1) or server aggregation.
- [ ] Status badge component with exact STATUS_COLORS map + fallback.
- [ ] `AttendanceCard` row differences per role (Branch/Duration vs Source).
- [ ] Load flow: initial → refresh → loadMore; race guard via request sequence.
- [ ] Error paths: full-error Retry; partial error banner (superadmin); empty states + Reset (superadmin).
- [ ] Pagination footer (Load More / End of list) + refresh controls.
- [ ] Role matrix parity: no branch filter on admin; scanner entry on admin only.
- [ ] A11y: labels, contrast, focus, icons (O2/O3).
- [ ] Resolve/flag R1-R4 + I1-I7 against product owner before green-lighting.

## 26. Definition of Done — Audit Checklist

Tick each item only when **the React.js port satisfies it**:

- [ ] Attendance list loads for today by default (date stamp in header matches the selected date client-side).
- [ ] Debounced member search (500ms) refetches page 1 on commit.
- [ ] Date sheet: 30-day history with Today/Yesterday/weekday labels; selection refetches with `date=YYYY-MM-DD`.
- [ ] Branch sheet (superadmin only): All Branches vs specific; `branchCode` omitted when `ALL`; admin UI shows "Your branch only" instead.
- [ ] KPI grid shows Total/Present/Late/Completed with colors: accent `#8b5cf6`, success `#2EB872`, `#f59e0b`, `#E11D2E`; includes current-page caveat (R1).
- [ ] Record card shows avatar(initials), name, phone, status pill, and role-correct rows (Branch·Check-in·Check-out·Duration for superadmin; Check-in·Check-out·Source for admin).
- [ ] Status colors/fallback match STATUS_COLORS (incl. `#2ecc71` completed, `#a855f7` half-day, `#E5484D` absent).
- [ ] Pagination: limit 20, `onEndReached` + Load More, "End of list"; request-race guard prevents stale overwrite.
- [ ] Initial loading spinner, full-error + Retry, partial-error banner (superadmin), empty states (filters-aware) + Reset (superadmin).
- [ ] Pull-to-refresh and header ↻ refresh disabled while a request is in flight.
- [ ] Admin scanner card navigates to ScannerIntegration route.
- [ ] No write/delete controls are exposed on these read-only dashboards (as today) unless product decides otherwise.
- [ ] R1–R4 + I1–I7 from §24 are either implemented, or explicitly deferred with owner sign-off articulated in the ticket.
- [ ] Accessibility pass: all interactive elements labeled; no glyph-only controls; contrast verified.
- [ ] Confirmed parity against the source screens' visual spec (§18) and role matrix (§16).

## 27. Unknowns / Not Confirmed

- **Screenshot:** no attendance screenshot exists in the workspace; screenshot-to-code claims in §12 are **inferred from the description**, not verified against an image.
- **Scanner Integration screen** (`ScannerIntegrationScreen.tsx`) contents are out of scope here; only its route wiring was confirmed.
- **Server write flows:** `memberCheckIn/memberCheckOut/getMyStats/exportMyAttendance/updateAttendance/deleteAttendance` were read but are **not reachable from the audited screens**; their UI (if any) lives outside this feature.
- **`GRACE_PERIOD_MINUTES = 15`** is declared in the controller and unused — likely a vestige of an earlier grace-period rule. Not confirmed what it was intended to do.
- **`faceRecognitionMatched` / `POST /face-verify`** is a placeholder; real face matching exists only in the member flow if at all. Not confirmed.
- **`half-day`** semantics (§24 I1) have no producing code path — real-world intent unknown.
- **Env-var geofencing values** (`GYM_LATITUDE`, `GYM_LONGITUDE`, `GYM_LOCATION_RADIUS_METERS`) are referenced but unreadable from source alone; geofence is active only for secret-code `/mark` and member check-out.

## 28. Summary

Two near-identical, read-only dashboards surface a single backend endpoint `GET /attendance` (`history`), which enforces gym + branch scope server-side (superadmin = all/param; admin & trainer = own branch; trainer = own assigned members), supports `date` (exact `YYYY-MM-DD`), `search` (member name regex), and pagination (limit 20). The client duplicates its entire component kit across two files, computes KPI cards from loaded records only (R1), and provides zero record-mutation UI despite having PUT/DELETE clients. The backend is otherwise feature-complete for self-service attendance (check-in/out, stats, streaks, exports, realtime, audit logs, soft delete, Socket.IO events) but those capabilities have no admin/superadmin-facing UI. Migration risks cluster around client/server status semantics (R2/I2, half-day), timezone/date string handling (R4), and the shadowed admin check-in route (R3).

## 29. Final Note & Confirmation of No Changes

- **Files inspected:** `SuperadminAttendanceScreen.tsx`, `AdminAttendanceScreen.tsx`, `src/api/attendance.ts`, `server/routes/attendance.routes.js`, `server/models/attendance.model.js`, `server/controllers/attendance.controller.js`, plus navigation/theme/middleware/utils confirmed in prior audits.
- **Unknowns confirmed:** no screenshot exists (only app icons under `assets/`); admin write endpoints unused; `half-day` unproducible; `GRACE_PERIOD_MINUTES` unused; `POST /check-in` admin route shadowed.
- **Changes made:** **None.** This audit is read-only reference material for the React.js rebuild. No frontend or backend files were modified during this investigation.