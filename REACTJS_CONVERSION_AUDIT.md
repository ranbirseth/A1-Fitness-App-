# A1 FITNESS — REACTJS CONVERSION AUDIT & REBUILD BLUEPRINT

> Phase-1 audit of the existing **React Native + Expo (SDK 57)** A1 Fitness app and its **Node.js/Express + MongoDB** backend, so the web frontend can be rebuilt feature-by-feature in **React.js**.
>
> **Target role scope for the web rebuild:** Branch Admin + Super Admin dashboards (the two roles the existing mobile app actually serves end-to-end).

**Status keys used throughout** (from `A1_FITNESS_REPORT_DATA.md` Part L):
`V` = verified implemented · `P` = partial · `U` = UI-only prototype (mock, not wired to backend) · `B` = backend-only (no UI) · `PD` = planned / not found · `C` = requires owner confirmation

Tests referenced "existing" are present in the repo; **pass/fail status must be confirmed by running** `npm test` in `server/` and at the repo root (Part 22).

---

## 1. EXECUTIVE SUMMARY

A1 Fitness is a multi-branch gym management system. Current shape of the codebase:

| Layer | Status (verified) |
| --- | --- |
| Mobile client (React Native) | Real app for **superadmin + branch-admin** workflows (dashboards, branches, admins, members, plans, attendance, payments/reminders, scanners). Login/Home screens are **skeletons**; a Sprint label of "skeleton" screens is expected. |
| Backend (Express REST + Socket.IO + MongoDB) | Fully featured; **trainer/member modules are backend-complete but have no mobile UI**; several services (WhatsApp, online payments, invoice delivery, face recognition) are stubs/disabled. |
| Scanner "setup/integration" screens | **UI prototypes only** (`src/mocks/`); real scanner management exists in ScannerList/Details/Form against the API. |
| Tests | 8 automated suites exist (7 under `server/test/`, 1 root `tests/idempotency.test.mjs`) using Node's built-in test runner. |

**The React.js rebuild is a green-field web frontend that talks to the existing backend over the same REST API** (`V` — API is stateless bearer-protected, `V/C` — CORS allowlist already permits a web-client origin for Vercel). No mobile-only patterns need porting; the web app re-implements only the two admin surfaces plus the parts of the workflow the mobile app actually exposes.

---

## 2. CURRENT SYSTEM OVERVIEW (AS-IS)

- **Architecture (verified):** Client–server, three-tier. Mobile (React Native, `src/`, Expo SDK 57) ⇄ Business (Express REST API + Socket.IO, `server/`) ⇄ Data (MongoDB/Mongoose + optional Redis). Backend is a **monolith** with modular MVC layering.
- **Auth flow:** POST `/api/auth/login` (`gymId`, `email`, `password`, `role`) → JWT access + refresh pair → stored in **expo-secure-store** (web equivalent: httpOnly cookie or memory + localStorage refresh token — see Part 10) → bearer on all requests → on 401 the client refreshes the pair (**single-flight, retry-once**, `src/api/client.ts:169–206`).
- **Authorization:** `protect` (JWT) → `authorize(perm)` (RBAC) → `branchScope` (branch isolation) → controller `enforceBranchOwnership`. The web app must respect the same rules for the same two roles.
- **Realtime (`V`):** Socket.IO events `member:updated`, `attendance:checkin`, `attendance:checkout`, `attendance:update` — used for live list refreshes.
- **Member-enroll data flow:** Admin fills a form → `POST /api/members` (optionally with plan+payment) → Mongoose transaction creates User+Member+Payment+Notification → Socket.IO `member:updated` → list refreshes. Same flow must work from the browser.
- **Deployment today:** mobile via EAS → APK/IPA; backend on Render (prod path serves `../client/dist`); MongoDB Atlas; Redis optional.

---

## 3. TECH STACK INVENTORY (V — from package.json / code)

### Mobile (existing, to be replaced)
| Concern | Tool | Notes |
| --- | --- | --- |
| Framework | expo ~57.0.21 · react-native 0.86.3 · react 19.2.3 | |
| Language | TypeScript ~6.0.3 | |
| Navigation | @react-navigation/native ^7.3.18, native-stack ^7.18.10 | drawer is custom (modal slide-in), not react-navigation |
| Storage | expo-secure-store | session |
| No UI kit, no charts, no forms lib, no state lib | — | hand-rolled components, Unicode glyph icons, `StyleSheet` |

### Backend (shared — the web app consumes it unchanged)
Express ^4.22 · Mongoose ^8 · MongoDB · jsonwebtoken ^9 · Socket.IO ^4.8 · bcryptjs ^2.4.3 · PDFKit ^0.20 · zod ^3.23 · node-cron ^3 · ioredis ^5.10 · Cloudinary ^2.5 · express-rate-limit · helmet · morgan · winston. (Bibliography in `A1_FITNESS_REPORT_DATA.md` Part K.)

### Recommended web stack (proposal — confirm (`C`) before building)
Vite + React 19 + TypeScript · react-router (v7) · TanStack Query for server state · a thin fetch/axios wrapper replicating the RN `client.ts` (env log sanitizer + 401 refresh single-flight) · Zustand or Context for session/UI state · Tailwind or CSS Modules · Recharts (charts) · react-hook-form + zod (forms). npm workspace structure under `client/` matching backend "prod path serves `client/dist`".

---

## 4. PROJECT FOLDER STRUCTURE (CURRENT RN APP — V)

```
A1FitnessApp/
├─ App.tsx                 # root; wraps SafeArea + status bar, mounts Navigation
├─ app.json                # Expo config + projectId (SDK 57)
├─ eas.json                # EAS build profiles
├─ package.json            # RN deps; scripts: start/android/ios/web/test
├─ tests/                  # idempotency.test.mjs (root, node:test)
├─ src/
│  ├─ api/                 # client.ts (fetch wrapper: auth, refresh, errors, logging)
│  │                        #   + resource modules: auth/dashboard/branches/admins/
│  │                        #     members/plans/attendance/payments/scanners/idempotency
│  ├─ auth/                # session handling (SecureStore-backed)
│  ├─ components/          # StatusBadge, SuperadminHeader, screens' shared bits,
│  │                        #   member/MemberFormModal + MemberSubscriptionModal,
│  │                        #   drawer/{AdminDrawer,SuperadminDrawer,DrawerContext}
│  ├─ config/              # api base URL, providers, theme
│  ├─ constants/           # e.g. LIMIT = 20, SEARCH_DEBOUNCE_MS = 500
│  ├─ mocks/               # ScannerProvider.tsx + scannerData.ts (PROTOTYPE ONLY)
│  ├─ navigation/          # index.tsx (role-based stack) + types.ts (route params)
│  ├─ screens/             # 24 screens (inventory in Part 7)
│  ├─ theme/               # colors.ts (tokens), ThemeContext, themeConfig
│  └─ utils/               # formatINR, formatShortDate, relativeTime etc.
└─ server/
   ├─ controllers/         # MVC controllers (auth, user, branch, member, plan,
   │                        #   payment, attendance, scanner, scannerEvents, reminder,
   │                        #   trainer, workout, diet, progress, booking, referral,
   │                        #   notification, analytics, dashboard, generic, upload)
   ├─ models/              # 20 Mongoose models (Part 11)
   ├─ routes/              # 19 route files (Part 11)
   ├─ middleware/          # protect, authorize, branchScope, scannerAuth, error handler
   ├─ services/            # whatsapp, invoiceDelivery, scanner, reminder, storage,
   │                        #   branchRename, paymentStatusFilter, expiryReminder job...
   ├─ config/              # db.js, logger.js, ...
   ├─ scripts/ + seeds/    # debug/fix scripts, seedLogic, backfills
   └─ test/                # 7 node:test suites (Part 22)
```

---

## 5. CORE MODULES & CAPABILITIES

| Module | Capability | Status |
| --- | --- | --- |
| Auth | login, token refresh/rotation (cap 4), forgot/reset password, demo-login gate (off by default) | V (UI login skeleton) |
| Branches | CRUD + rename-cascade, branchCode regex + unique, manager ref | V |
| Admins | CRUD — superadmin only | V |
| Members | CRUD + approve + activate/deactivate; branch isolation; secret code; biometric stub | V |
| Plans | CRUD (superadmin) + apply/unapply to branches (PlanBranch) | V |
| Subscriptions | assign / renew / upgrade / freeze / resume / cancel — **idempotent** via `termKey`/`idempotencyKey` in a Mongo transaction | V |
| Payments | record, mark paid/unpaid, invoice JSON + branded A4 PDF (pdfkit) | V |
| Online payments | gateway intent | **PD/stub (501)** |
| Invoice delivery | email/WhatsApp delivery | **stub (402 paywall)** |
| Attendance | check-in/out, statuses (present/completed/late/half-day/absent), IST dates, geofence 100 m (env), soft-delete, audit, streaks, Socket.IO events | V (geofence P) |
| Scanner hardware | register + API key (hash-only store), heartbeat, event ingestion + decision engine (allow/deny + reason codes), rotate key, disable | V |
| Scanner UI (setup/integration) | mock prototype screens | U |
| Dashboards | KPI cards, 7-day revenue chart, recent activity, branch selector | V |
| Analytics | overview KPIs + CSV/PDF export | V |
| Reminders | eligibility + dedupe; in-app (`V`) + WhatsApp (service ready, **env-disabled**) | V / P |
| Trainer module | trainer CRUD + assigned members | B |
| Workout / Diet | template CRUD + branch junctions + assignment | B |
| Progress | weight/height/BMI logging | B |
| Booking / Referral | class-slot bookings, referrals | B |
| Notifications | in-app model + router | B |
| Audit logging | AuditLog model written by member/trainer/attendance changes | V |

---

## 6. ROLES & PERMISSIONS

Two roles are end-to-end today and are the web rebuild's scope:

**Branch Admin**
- Own-branch data only (enforced by `branchScope` + `enforceBranchOwnership`).
- Members: create/approve/update/delete; assign (not create) plans to members.
- Plans: **read-only** (see plans applied to own branch).
- Payments & reminders: record/mark, invoices, send reminders; billing analytics.
- Attendance: mark + edit, branch filters.
- Scanners: **full management** — register, edit, status chips, enrollment sync payload (`getSyncPayload`), rotate API key, disable.
- Cannot create plans; cannot create trainers (`V`).

**Super Admin**
- Global view across branches (branch selector).
- Branches CRUD; Admins CRUD; Members (all branches); Plans CRUD + apply/unapply to branches; Payments (all branches) + analytics; Attendance (all branches).
- Scanners: **read-only** (`V` — `adminOnly` guard + tests; course rule "Super Admin doesn't register scanners").
- Disabled/planned menu items: Trainers ("Soon"), Settings ("Soon").

**Other actors (backend-complete only, no mobile UI — web rebuild optional):** Trainer, Member self-service (@member signup `V` backend; login blocked until approved → 403).

---

## 7. SCREEN INVENTORY (24 SCREENS — V, source: `src/screens/`)

### Shared / auth
| Screen | Purpose | Route | Status |
| --- | --- | --- | --- |
| SplashScreen | session restore | Splash | V |
| HomeScreen | member/trainer fallback placeholder | Home | U (skeleton) |
| LoginScreen | login w/ role tabs (gymId, email, password) | Login | V |

### Super Admin stack
| Screen | Key behaviors | File |
| --- | --- | --- |
| SuperadminDashboardScreen | KPI grid, 7-day revenue bar chart, recent activity, branch filter | SuperadminDashboardScreen.tsx |
| SuperadminBranchesScreen | branch cards, add branch | SuperadminBranchesScreen.tsx |
| BranchDetailsScreen | branch KPIs (totalMembers, activeMembers, staff, revenue, payments, attendance, active/expiring/expired memberships) + tabs | BranchDetailsScreen.tsx |
| SuperadminAdminsScreen | admin CRUD | SuperadminAdminsScreen.tsx |
| SuperadminMembersScreen | filterable member list, approve, status toggles | SuperadminMembersScreen.tsx |
| MemberDetailsScreen | member profile + subscription actions | MemberDetailsScreen.tsx |
| SuperadminPlansScreen | plan CRUD + apply/unapply to branches + branch chips | SuperadminPlansScreen.tsx |
| SuperadminAttendanceScreen | attendance KPIs + date sheet (date chips) | SuperadminAttendanceScreen.tsx |
| SuperadminPaymentsScreen | payments + invoices + reminders + analytics, branch filter | SuperadminPaymentsScreen.tsx |
| ScannerListScreen | device list, KPIs (total/online) | ScannerListScreen.tsx |
| ScannerDetailsScreen | **read-only** (no edit/status/sync/rotate/disable) | ScannerDetailsScreen.tsx |
| ScannerFormScreen | **blocked with "Read-only access" view** | ScannerFormScreen.tsx |

### Branch Admin stack
| Screen | Key behaviors | File |
| --- | --- | --- |
| AdminDashboardScreen | branch-scoped KPI cards (₹, short dates, relative time) | AdminDashboardScreen.tsx |
| AdminMembersScreen | search (debounce 500 ms) + status filters (all/active/pending/expired/frozen/cancelled/inactive), approve, update toggle, delete, invoice/payment flows | AdminMembersScreen.tsx |
| AdminMemberDetailsScreen | member mgmt, approve banner, subscription actions | AdminMemberDetailsScreen.tsx |
| AdminPlansScreen | **read-only** plan list (branchCode) | AdminPlansScreen.tsx |
| AdminAttendanceScreen | attendance + scanner entry, KPIs, date sheet | AdminAttendanceScreen.tsx |
| AdminPaymentsScreen | Payments/Reminders tabs; periods Today/ThisMonth/ThisYear; mark paid/unpaid; invoice modal (`getInvoice`); sendReminders; manual `wa.me` deep link; analytics KPIs | AdminPaymentsScreen.tsx |
| ScannerListScreen | device list + **+ button** (register) | ScannerListScreen.tsx |
| ScannerDetailsScreen | full management: status chips, sync payload, rotate key (new key shown once), disable | ScannerDetailsScreen.tsx |
| ScannerFormScreen | create/update scanner (protocols tcp/usb/p2p; types fingerprint/card/fingerprint_card/face; defaults eSSL/K30 Pro; deviceId editable only on create; apiKey shown once) | ScannerFormScreen.tsx |

### Admin-only prototype screens (U — mock, not wired to API)
| Screen | Purpose | File |
| --- | --- | --- |
| ScannerIntegrationScreen | mock device list, sorted, connection test | ScannerIntegrationScreen.tsx |
| ScannerSetupScreen | mock setup form | ScannerSetupScreen.tsx |
| ScannerDetailScreen | mock detail + test connection | ScannerDetailScreen.tsx |

> **Do not rebuild these three in React.js until the scanner hardware path is wired to the real API** — they render mock data from `src/mocks/ScannerProvider.tsx`.

---

## 8. NAVIGATION MAP (V — `src/navigation/index.tsx`)

```
Root Stack (custom dark theme)
  ├─ not authenticated → Login
  ├─ splash resolving → Splash → (role-based initial route)
  └─ authenticated →
       ├─ superadmin → SuperadminDashboard
       │    ├─ SuperadminBranches → BranchDetails
       │    ├─ SuperadminAdmins
       │    ├─ SuperadminMembers → MemberDetails
       │    ├─ SuperadminPlans
       │    ├─ SuperadminAttendance
       │    ├─ SuperadminPayments
       │    └─ ScannerList → ScannerDetails | ScannerForm(blocked read-only)
       └─ admin → AdminDashboard
            ├─ AdminMembers → AdminMemberDetails
            ├─ AdminPlans
            ├─ AdminAttendance
            ├─ AdminPayments
            └─ ScannerList → ScannerDetails | ScannerForm
                 ├─ (admin-only) ScannerIntegration
                 ├─ ScannerSetup
                 └─ ScannerDetail
```

Drawers are custom slide-in components (`components/drawer/`):
- **AdminDrawer** items: Dashboard, Members, Plans, Attendance, Payments & Reminders, Scanners; bottom Logout; branch badge showing `user.branchCode`; width min(82% window, 340).
- **SuperadminDrawer** items: Dashboard, Branches, Admins, Members, Plans, Attendance, Scanners, Payments & Reminders; Trainers + Settings disabled "Soon"; Logout.
- `DrawerContext` key: set active section + close drawer.

**React.js mapping:** one shell layout per role — sidebar (drawer items), top header, nested routes (e.g. `/admin/members/:memberId`, `/sa/scanners/:scannerId`). Same menu sets, same read-only/disabled rules.

---

## 9. FEATURE INVENTORY (CONSOLIDATED, TAGGED)

**Core (must ship in web rebuild):**
- [V] Login with role (`admin`/`superadmin`) + friendly error mapping ("account inactive…", "credentials are incorrect…"); show/hide password.
- [V] Role-based navigation + sidebar.
- [V] Superadmin: branch CRUD (+rename cascade), admin CRUD, member CRUD (all branches), plan CRUD + apply/remove plan↔branch, all-branch payments/attendance, global analytics.
- [V] Admin: member CRUD (own branch), plan read-only, payments + mark paid/unpaid, invoices, reminders, attendance marking/editing, scanner management.
- [V] Dashboard KPIs (super: global with branch filter; admin: own branch) + 7-day revenue chart.
- [V] Subscription ops: assign/renew/upgrade/freeze/resume/cancel + payment record in one idempotent transaction.
- [V] Member approve/activate/deactivate; payment status badges.
- [V] Invoice JSON + PDF (backend `getInvoice`, `generateInvoicePDF`) — shown in web via modal/preview + download.
- [V] Attendance date-sheet (30-day window), status colors: present→success, completed→#2ecc71, late→#f59e0b, half-day→#a855f7, absent→danger.
- [V] Scanner real list/details/form (admin) + read-only details (superadmin).
- [V] Refresh via Socket.IO events (`member:updated`, `attendance:*`).
- [V] CSV/PDF analytics export (backend).

**Partial / disabled (port only what owner wants):**
- [P] WhatsApp reminders — service ready + unit-tested, disabled in `.env`. Web may show status/banners + manual `wa.me` deep link (keep the deep link).
- [P] Redis caching (dashboard 15 s, attendance status) — off when `REDIS_URL` empty; irrelevant to web UI.
- [P] Cloudinary uploads — `USE_CLOUDINARY=false`; member photos optional.
- [P] Geofence — env-configured (lat 23.4666909, lon 87.4534923, r 100 m); only for mobile biometric paths.
- [P] Demo login — gated off by default.
- [U] Scanner setup/integration screens — mock only; exclude from web scope.
- [U/PD] Face recognition — `faceVerifyPlaceholder`; exclude.
- [PD/stub] Online payment gateway (501); invoice delivery (402); push notifications (FCM/APNs) not found.

**Backend-only (optional web scope):** Trainer dashboard, member self-service, workout/diet assignment UI, progress/BM recording, booking, referral, notifications UI.

---

## 10. AUTHENTICATION & SESSION (WEB-SPECIFIC NOTES)

Mirror the RN behavior exactly:
- `POST /api/auth/login` with `{ gymId, email, password, role }`.
- Store credentials/security **without** SecureStore: propose httpOnly cookies if the backend is extended, otherwise in-memory + refresh token in `localStorage`; **either way do not log tokens** (`V` backend sanitizes log messages; web client must keep its own sanitizer). `C` — confirm owner preference.
- 401 → single-flight refresh → retry original once; on refresh failure → logout (clears local session even if offline).
- Persist `user` object (id, gymId, branchCode, name, email, phone, role, status) for the sidebar branch badge.
- Badges/states: role tabs, `showPassword` toggle, friendly error mapping listed in Part 9.
- Route guard: unauthenticated → `/login`; role-guard routes by `user.role`; branch badge on admin sidebar.

---

## 11. DATA MODELS & API SURFACE

### 20 Mongoose models (V — `server/models/`)
User · Member · Plan · Payment · Attendance · AuditLog(gin) · Booking · DietPlan · DietTemplateBranch · Branch(within generic) · ClassSlot · InventoryItem · Referral · Notification · PlanBranch · Progress · Scanner · ScannerEvent · WorkoutPlan · WorkoutTemplateBranch.

Key uniqueness/idempotency contracts the web client must rely on:
- `User.gymId+email` unique (partial); `Member.user` unique; `Member.secretCode` unique sparse.
- `Plan.gymId+name+branchCode` unique.
- `Payment`: `gymId+invoiceNumber` unique; `gymId+termKey` unique partial; `gymId+idempotencyKey` unique partial → **idempotent subscribe/assign**.
- `Attendance`: `gymId+member+date` unique; soft delete `deletedAt`; `deviceEventId` unique sparse.
- `Scanner.deviceId` unique; `apiKeyHash` hashed, `select:false`.

### REST routes (V — `server/routes/`, 19 files)
`auth` · `user` · `branch` · `admin` · `member` · `plan` · `payment` · `attendance` · `scaner`(scanner) · `scannerEvents` · `reminder` · `dashboard` · `analytics` · `trainer` · `workout` · `diet` · `progress` · `booking` · `referral` · `notification` · `generic` · `upload`.

Envelope: success `{ success, message, data }`; lists `{ items, page, limit, total }` (web paging constants: LIMIT=20, search debounce 500 ms).

### Web client need
One resource module per API (mirror `src/api/*.ts`), same endpoint strings, same param shapes (toDateParam for YYYY-MM-DD, etc.).

---

## 12. REAL-TIME & THIRD-PARTY

- Socket.IO: `member:updated`, `attendance:checkin`, `attendance:checkout`, `attendance:update` — connect after login (auth handshake), subscribe to lists, refresh on events.
- WhatsApp: `POST /api/reminders/send` triggers server-side WhatsApp when configured; fallback `https://wa.me/<phone>?text=…` deep link currently used for manual reminders — keep it.
- Optional: Cloudinary for member photos; Redis caching transparent to client.
- Online payment gateway and invoice email/SMS delivery are stubs — render appropriate "not configured yet" UI rather than dead buttons.

---

## 13. FEATURE-BY-FEATURE BUILD PROMPTS — AUTH, SHELL, DASHBOARD

Use each prompt as a self-contained implementation instruction for the React.js rebuild.

### P1. Project scaffold
- Vite + React 19 + TypeScript strict; React Router v7; package scripts mirroring `npm run dev/build`.
- API base from env (`VITE_API_URL`), default `https://a1-fitness.onrender.com/api` (`C`).

### P2. API client
- Replicate `src/api/client.ts`: JSON envelope parsing, `Authorization: Bearer`, single-flight 401 refresh retry-once, friendly error mapping, and a **log sanitizer** that never prints tokens/secrets. Export typed resource modules (auth, dashboard, branches, admins, members, plans, attendance, payments, scanners, analytics).

### P3. Auth screens
- Login (gymId/email/password/role tabs; show/hide password; friendly errors). Session persistence + restore (mirror Splash). Route guard + role guard.

### P4. Shell & sidebar
- Two layouts: `SuperadminLayout`, `AdminLayout`. Sidebar = the drawer menus (Part 8) incl. disabled "Soon" items (Trainers, Settings) and Logout; admin branch badge. Top bar with page title + socket status.

### P5. Superadmin dashboard
- KPI grid, 7-day revenue chart, recent activity feed, branch selector (drives all queries). KPIs from `GET /api/dashboard/...` stats.
- Admin dashboard: same, branch-scoped, 5 KPI cards.

---

## 14. BUILD PROMPTS — BRANCHES & ADMINS (SUPERADMIN)

### P6. Branches list + create
- Card list from `GET /api/branches`; create form (name, branchCode, address, phone, email); show validation errors (branchCode regex + unique).

### P7. Branch details
- KPI sections: members, active memberships, expiring/expired memberships, payments/revenue, attendance, staff; tabs (members/payments/trainers) reusing list components; rename with cascade warning.

### P8. Admins (superadmin only)
- List, create, edit, deactivate, delete via `GET/POST/PATCH/DELETE /api/admins`. Guard: 403 for non-superadmin.

---

## 15. BUILD PROMPTS — MEMBERS

### P9. Member list + filters
- Search (debounce ≥500 ms), status chips (all/active/pending/expired/frozen/cancelled/inactive), payment-status badges, pagination (LIMIT 20). Refresh on `member:updated`.

### P10. Member form (create/edit)
- Fields from `MemberFormModal` (name/email/phone/plan/trainer for admin; branchCode for superadmin — admin locked to own branch), `requirePassword=false` path. Validate client-side; surface API errors.

### P11. Member details
- Profile sections (Plan/Subscription, Progress optional), approve banner for pending, active/inactive toggle, delete (confirm), trigger subscription modal.

### P12. Subscription modal
- assign / renew / upgrade / freeze / resume / cancel (+ payment fields). Use one idempotency key per intent to prevent double-submit duplicates; show resulting payment + invoice.

---

## 16. BUILD PROMPTS — PLANS & PAYMENTS

### P13. Plans
- Superadmin: CRUD + apply/unapply to branches (PlanBranch chips) + plan-branch mapping.
- Admin: read-only list of plans available in own branch ("Available in your branch").

### P14. Payments
- Payments list with period picker (Today/ThisMonth/ThisYear), mark paid/unpaid, payment-status filter; invoice modal preview with JSON + PDF download (`getInvoice`); share/print.

### P15. Invoices
- Reuse backend invoice JSON + pdfkit PDF; render line items, business info, totals; download button.

### P16. Reminders
- Reminder list + send (eligibility + dedupe server-side); render result summary; manual `wa.me` deep link as fallback; show WhatsApp enabled/disabled state (`C`/env).

---

## 17. BUILD PROMPTS — ATTENDANCE, SCANNERS, ANALYTICS

### P17. Attendance
- KPI card row + 30-day date sheet with date chips, status colors (Part 9), search, mark attendance (check-in/out), edit status; live refresh via `attendance:*` sockets. Superadmin variant with branch selector.

### P18. Scanners — real screens
- List: KPI totals (total/online), device cards, online/offline/maintenance/disabled states.
- Admin details: status chips (online/offline/maintenance), edit form (protocols/types/brand/model + toggle settings), enrollment sync payload count, rotate API key (new key shown **once**), disable/delete.
- Superadmin: details **read-only** (no edit/status/sync/rotate/disable); form replaced by read-only view.
- Form: deviceId editable only on create; defaults eSSL/K30 Pro; protocols tcp/usb/p2p; types fingerprint/card/fingerprint_card/face.

### P19. Analytics & exports
- Overview KPIs (revenue/memberships/attendance) from `GET /api/analytics/...`; branch/trainer scoping for superadmin; CSV/PDF export buttons.

### P20. Realtime wiring
- Central socket hook: connect post-login, subscribe to `member:updated` + `attendance:*`, invalidate affected TanStack Query keys.

---

## 18. BUILD PROMPTS — OPTIONAL (BACKEND-ONLY SCOPE)

Only if owner confirms (`C`): Trainer list/assign screen, workout/diet assignment UI, progress + BMI chart, booking, referral, notifications inbox, member self-service portal, push notifications. Backend endpoints exist (Part 11) and are wired/branch-scoped; the mobile app has **no UI** for any of these, so treat as net-new UX work, not porting.

---

## 19. REPORTING / DATA EXPORT

- Backend already provides analytics export (CSV/PDF) — expose via buttons with branch/date filters. No charting lib exists in the RN app; web will use Recharts for the 7-day revenue, attendance trend, and payment-period bars. Keep **declared** numbers identical to API responses (no invented KPIs).

---

## 20. TESTING PLAN (WEB REBUILD)

Layers, mapped to the audited contracts:
1. **Unit:** form validators (member/plan/subscription), INR/date/relative-time formatters (reuse RN utils semantics), error-message mapping, token-storage helpers, idempotency-key generation (match root `tests/idempotency.test.mjs` ~3 cases).
2. **Component:** Login (role tabs, show/hide, friendly errors), sidebar menu rendering per role incl. disabled items, KPI/status-badge color maps, invoice modal.
3. **Integration (msw/real API):** login→dashboard, member create→list refresh, assign-plan→one payment (idempotency), mark paid→badge update, attendance date-sheet navigation, scanner rotate-key (single-show), read-only guards (superadmin on scanners; admin can't create plans).
4. **E2E:** full superadmin + admin journeys against the backend on Render (`C` for URL); mirror the backend's 20-case manual plan (T01–T20 in `A1_FITNESS_REPORT_DATA.md` §H2).
5. **Backend regression to re-run:** the 8 suites in Part 22 stay green (they exercise the API the web app depends on).

---

## 21. BUGS, RISKS & GAPS

| # | Item | Type | Impact on rebuild |
| --- | --- | --- | --- |
| 1 | Online payment gateway is a 501 stub | Known gap | Show "not configured" states; design intent in upgrades later (`C`) |
| 2 | Invoice email/WhatsApp delivery is a 402 paywall stub | Known gap | Browser download only |
| 3 | WhatsApp reminders disabled in `.env` (unit-tested only) | Known gap | Keep `wa.me` fallback |
| 4 | Scanner setup/integration screens are mocks (U) | Prototype | **Exclude from web scope** |
| 5 | Face recognition = placeholder | Known gap | Exclude |
| 6 | Login/Home screens are skeletons in RN | Pre-existing | Web rebuild replaces them properly |
| 7 | Redis/Cloudinary optional + off in dev | Config | Transparent to client |
| 8 | Trainer/member/workout/diet/booking/referral/notification have no UI | Backend-only | Optional scope (Part 18) |
| 9 | No measured perf numbers; old draft §8.2 claims unverified | Reporting | Do not restate old numbers |
| 10 | CORS: backend allowlist already includes a web-client origin (Vercel) | `V/C` | Confirm exact origin before deploy |
| 11 | Auth storage strategy for web vs SecureStore | Design decision | Resolve in Part 10 (`C`) |
| 12 | Session refresh failure while offline | Edge | Match RN behavior: clear local session |
| 13 | Names/formatting drift between backend & old draft docs | Doc debt | Trust `A1_FITNESS_REPORT_DATA.md`, not old `PROJECT_REPORT.md` claims |
| 14 | Screens adorned with hidden plan-assignment for pending members | Behavior | Keep parity with `runMembershipPaymentOp` idempotency |

---

## 22. AUTOMATED TEST INVENTORY (EXISTING — RUN TO CONFIRM)

**Correction to `A1_FITNESS_REPORT_DATA.md` §H1 (which lists 6 files):** the glob in Phase-1 found **8** files.

| Test file | Framework | Focus | Status |
| --- | --- | --- | --- |
| `tests/idempotency.test.mjs` (root) | node:test (ESM) | `generateIdempotencyKey` UUID v4 + uniqueness | V ~3 cases |
| `server/test/membership-payment.test.js` | node:test | assign-plan idempotency, duplicate-key classification, sparse-unique indexes, branch isolation, term-key determinism | V ~10 cases |
| `server/test/reminder.test.js` | node:test | WhatsApp service + phone normalization + eligibility + branch auth | V ~16 cases |
| `server/test/reminder-bulk.test.js` | node:test | bulk reminder aggregation/limits | V |
| `server/test/scanner-permissions.test.js` | node:test | superadmin read-only vs admin CRUD vs 401/403 | V ~8 cases |
| `server/test/scanner-service.test.js` | node:test | event decision chain: check-in/late/check-out/duplicate/denied/dedupe | V ~8 cases |
| `server/test/scanner-utils.test.js` | node:test | IST date utils, eligibility, device-key hash | V ~6 cases |
| `server/test/whatsapp-env.test.js` | node:test | WhatsApp env/credential gating | V |

Run commands: `npm test` at repo root (idempotency) and in `server/` (backend suites). ~51 + cases / ~150+ assertions expect to pass (`C` — confirm outputs to report exact counts).

---

## 23. SECURITY & NFR CONTRACTS TO PRESERVE

- bcrypt cost 10 hashes; login never reveals whether email vs password failed (one friendly message).
- JWT access/refresh rotation with cap 4; refresh tokens stored; single-flight refresh.
- Rate limit 300/15 min; helmet headers; CORS allowlist; 1 MB JSON body limit.
- Secrets never logged (client sanitizer + server sanitizers). Scanner API key displayed once then replaced by hash.
- Idempotent membership/payment writes (unique `termKey`/`idempotencyKey`) — **web must not double-submit**.
- Branch isolation on every query (never query without `branchCode`); RBAC guards mirror the middleware matrix.
- Timezone: attendance/date params passed as YYYY-MM-DD in IST via `toDateParam` (mirror RN util).

---

## 24. RECOMMENDED REACTJS ARCHITECTURE

```
Browser (React.js SPA)
   │  HTTPS JSON /api/* + wss Socket.IO
   ▼
Express REST API + Socket.IO (UNCHANGED)
   └─ MongoDB/Mongoose + Redis(optional)
```
- **Data fetching:** TanStack Query with per-route keys; mutations invalidate lists; socket events invalidate `members`, `attendance`, `payments`.
- **State:** session/role in Context or Zustand; server state only in TanStack Query.
- **Routing:** one shell per role; guards on login/session and role.
- **Forms:** react-hook-form + zod (match zod use on backend).
- **Realtime:** one socket hook used by dashboards, members, attendance, scanner lists.
- **Env/config:** `VITE_API_URL`, feature flags for WhatsApp/analytics/payments (match `.env` gates).
- Deliverable fits existing deploy: backend prod serves `../client/dist`, so `client/` builds into it when owner chooses web hosting (Vercel origin is allowed per CORS) (`C`).

---

## 25. RECOMMENDED REACTJS PROJECT STRUCTURE

```
client/  (new npm workspace / sibling to the RN app)
├─ src/
│  ├─ app/            # root, router, providers (query, socket, auth)
│  ├─ layouts/        # SuperadminLayout, AdminLayout, sidebar, header
│  ├─ routes/         # route table + guards
│  ├─ pages/          # one page per RN screen (Part 7)
│  ├─ features/       # members, plans, payments, attendance, scanners…
│  │   └─ <feature>/{api,components,hooks,types}
│  ├─ components/ui/  # StatusBadge, KPI cards, modals, date-sheet …
│  ├─ api/            # client.ts + resource modules (mirror src/api)
│  ├─ hooks/          # useSocket, useRefreshOnEvent, useBranchScope
│  ├─ lib/            # formatINR, formatShortDate, relativeTime, toDateParam
│  ├─ config/         # env, feature flags
│  └─ theme/          # tokens ported from src/theme/colors.ts
├─ tests/             # unit + component (Vitest) + integration (MSW)
└─ e2e/               # Playwright journeys
```

---

## 26. BUILD ORDER & MILESTONES

| Milestone | Scope | Depends on |
| --- | --- | --- |
| M1 | Scaffold, API client, auth, route guards | — |
| M2 | Shells + sidebars (both roles) | M1 |
| M3 | Dashboards + socket wiring | M1–M2 |
| M4 | Superadmin: branches + admins | M2 |
| M5 | Members: list/filters/form/details/approve/delete | M2, M3 |
| M6 | Subscription ops + payments + invoices + reminders | M5 |
| M7 | Plans (super CRUD + admin read-only) | M5 |
| M8 | Attendance (date sheet + marking + sockets) | M2, M3 |
| M9 | Scanners: real list/details/form + read-only rules | M2, M5 |
| M10 | Analytics + exports; polish; responsive pass | M3–M9 |
| M11 | Tests (unit/component/integration/e2e) + backend regression | M1–M10 |
| M12 | Deploy to web host (Vercel or via Client/dist) + CORS confirm | M11 |

Parallelize: M5/M7 share the member/plan/payment engine; M8/M9 depend on API contracts only.

---

## 27. FINAL CHECKLIST & DEFINITION OF DONE

- [ ] Auth: login/role tabs/show-password/friendly errors; session restore; 401 refresh single-flight.
- [ ] Guards: unauthenticated→login; role routing; superadmin blocked from admin-only actions; admin plan read-only; superadmin scanner read-only.
- [ ] Sidebars: correct menu per role incl. disabled Trainers/Settings + admin branch badge; Logout.
- [ ] Dashboards: KPIs exact-match API; 7-day revenue chart; branch selector (super) / branch-scoped (admin).
- [ ] Members: search filters, approve/activate/delete, member form, details, subscription modal; no double-submit (idempotency).
- [ ] Plans: super CRUD + apply/unapply branch chips; admin read-only list.
- [ ] Payments: period picker, mark paid/unpaid, invoice modal/PDF, reminders + `wa.me` fallback.
- [ ] Attendance: 30-day date sheet, 5 statuses + colors, marking, socket refresh.
- [ ] Scanners: real list/details/form; rotate-key shown once; superadmin read-only.
- [ ] Realtime: socket connect post-login; list refresh on member/attendance events.
- [ ] Error/sanitization: no secrets/tokens in logs; consistent envelope handling.
- [ ] Responsive + accessibility pass; final UI matches dark theme tokens (bg #0B0E11, surface #151A20, primary #E11D2E, etc.).
- [ ] Tests: added suites (unit/component/integration/e2e) green; backend 8-suite regression run.
- [ ] CORS/deploy confirmed (`C`); deploy build through existing Client/dist path or Vercel.
- [ ] Owner confirmations resolved from `A1_FITNESS_REPORT_DATA.md` Part M and flagged `C` items above.

---

## READY FOR REACT.JS REBUILD

Phase-1 audit complete. All 24 RN screens, both role navigation trees, the API surface (19 route files, 20 models), auth/session semantics, realtime contracts, and NFRs have been inventoried and tagged (V/P/U/B/PD/C). The web rebuild plan (Parts 13–18 build prompts), testing plan (Part 20), risk register (Part 21), architecture (Part 24), structure (Part 25), and milestones (Part 26) are ready to execute; the mocked scanner prototype, disabled/stub services, and backend-only modules are explicitly scoped so the rebuild ports the real, working workflows first.

Next step: confirm open `C` items (auth-storage strategy, web origin/CORS, optional backend-only scope, test outputs) → begin M1.