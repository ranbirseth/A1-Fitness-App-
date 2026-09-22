# A1 FITNESS — SUPER ADMIN UI AUDIT

> Audit of the React Native app's **Super Admin UI** so a fresh React.js frontend can recreate identical pages (structure, layout, design, components, states) later.
>
> Scope: `src/` inspection only. No code was modified. Anything not verifiable is marked `NOT DETERMINED` rather than invented.
> Stack inspected: React Native (Expo SDK 57), React Navigation native-stack, TypeScript.
> Report date: 19 Sep 2026.

---

## 0. Reading This Report

- Every claim traceable to a source file. `source: path:line`.
- Values not captured from the style blocks are listed as `NOT DETERMINED` (many `StyleSheet.create` blocks were only partially read in this pass).
- Status names map to colors via one shared component (see §13).
- The user originally asked for **22 sections**. Only **21 titles** were recoverable from the earlier (truncated) instruction; §22 is appended as a provisional final section and the lost title is flagged in §20.

---

## 1. Navigation

- **Container**: `NavigationContainer` with a customized `navTheme` — background/card `#0B0E11`, primary `#E11D2E`, text `#FFFFFF`, border `#2A333D`. `source: src/navigation/index.tsx:37-47`.
- **Stack**: single native-stack, `headerShown: false` (each screen draws its own header). `source: src/navigation/index.tsx:60`.
- **Auth gating** `source: src/navigation/index.tsx:61-98`:
  - status `restoring` → `SplashScreen`.
  - `authenticated && role === 'superadmin'` → Super Admin stack (below).
  - `authenticated && role === 'admin'` → Admin stack (separate screens).
  - authenticated with any other role → `HomeScreen`.
  - `unauthenticated` → `LoginScreen`.
- **Super Admin stack — exactly 12 routes** `source: src/navigation/index.tsx:65-77`:
  1. `SuperadminDashboard`
  2. `SuperadminBranches`
  3. `BranchDetails` (shared)
  4. `SuperadminAdmins`
  5. `SuperadminMembers`
  6. `MemberDetails` (shared)
  7. `SuperadminPlans`
  8. `SuperadminAttendance`
  9. `SuperadminPayments`
  10. `ScannerList` (shared)
  11. `ScannerDetails` (shared)
  12. `ScannerForm` (shared)
- **Not in the Super Admin stack** (admin-only): `ScannerIntegration`, `ScannerSetup`, `ScannerDetail`. A superadmin can never reach them. `source: src/navigation/index.tsx:86-91`.
- **Providers**: `ScannerProvider` (mock) wraps `DrawerProvider`; `RoleDrawerHost` renders the drawer overlay for the current role. `source: src/navigation/index.tsx:58-100`.
- Route param list: `AppStackParamList` in `src/navigation/types.ts` (`BranchDetails {branchId}`, `MemberDetails {memberId}`, `ScannerDetails {scannerId}`, `ScannerForm {scannerId?}`).

---

## 2. Dashboard

`source: src/screens/SuperadminDashboardScreen.tsx` (726 lines)

- Uses **its own inline header** — it does NOT import/use `SuperadminHeader`. Contains hamburger + branch selector.
- **Branch selector**: persists choice via `getSavedBranch`/`saveBranch` under key `a1fitness.dashboard.branch`; default `'ALL'`. `source: src/api/dashboard.ts`.
- **Data**: `getDashboardStats(branchCode)` → `DashboardStats { totalMembers, activePlans, revenue, activeTrainers, attendanceToday, revenueAnalytics[{_id,total}], recentActivities[{text,time,color}], branchCode }`, plus `getBranches()` for the selector. `source: src/api/dashboard.ts`.
- **KPI cards track**: Total members, Active plans, Revenue, Active trainers, Attendance today.
- **Revenue analytics**: chart/list driven by `revenueAnalytics`.
- **Activity feed**: `recentActivities`, each `{ text, time, color }`.
- **Loading state machine**: `LoadingMode = 'initial' | 'refresh' | 'idle'`; pull-to-refresh via `RefreshControl`. `source: SuperadminDashboardScreen.tsx:163`.
- **Formatters**: `formatINR` (`₹` + `toLocaleString('en-IN')`), `formatShortDate`, `relativeTime` (just now / `Xm ago` / `Xh ago` / `Xd ago` / `Xw ago`).

---

## 3. Branches

`source: src/screens/SuperadminBranchesScreen.tsx` (749 lines)

- Header: `SuperadminHeader` title "Branches", `right` = additive float button.
- **List**: branch cards each with `StatusBadge` (active/inactive).
- **Validation**: `BRANCH_CODE_REGEX /^[A-Z0-9][A-Z0-9_-]{1,19}$/` and `EMAIL_REGEX`. `source: SuperadminBranchesScreen.tsx` (head).
- **Actions**: create, update, delete (confirm `Alert`). Driven by `BranchItem { _id, name, branchCode, address?, phone?, email?, status }` and `BranchCreatePayload`/`BranchUpdatePayload`. `source: src/api/branches.ts`.
- **Form UX**: inline modal with `submitting` disabled state, `submitButtonDisabled` style. `source: SuperadminBranchesScreen.tsx:440-461`.
- Back navigation sets drawer active key to `'Branches'`.

---

## 4. Admins

`source: src/screens/SuperadminAdminsScreen.tsx` (836 lines)

- Header: `SuperadminHeader`, addictive "+" button.
- **List**: admin cards with `StatusBadge` and `branchCode` shown.
- **Validation**: `EMAIL_REGEX`; **cannot assign an admin to an inactive branch** (`'Cannot assign to an inactive branch.'`). `source: SuperadminAdminsScreen.tsx:162`.
- **Actions**: create / update / delete (`Alert` confirm). Uses `AdminItem { _id, name, email, phone?, role, status, branchCode, createdAt? }`, `AdminCreatePayload`, `AdminUpdatePayload`. `source: src/api/admins.ts`.
- **Role/sub-status handling**: `LoginScreen` maps blocked phrasing (`inactive/disabled/deactivated`) to user-facing message. `source: LoginScreen.tsx:33`.
- Drawer active key set to `'Admins'`.

---

## 5. Members

`source: src/screens/SuperadminMembersScreen.tsx` (864 lines)

- List with search/filter + `StatusBadge` on each row. Statuses: `pending | active | expired | frozen | cancelled | inactive` (`MemberStatus`).
- **Modals** (shared components, see §12):
  - `MemberFormModal` — create/edit member (name, email, phone, DOB `DD/MM/YYYY`, address, membership start date → canonical `YYYY-MM-DD`, plan, trainer, branch, gender, notes). Validation: `EMAIL_REGEX`, `DATE_REGEX /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/`. 670 lines.
  - `MemberSubscriptionModal` — **Assign / Renew / Cancel** a plan. `PAYMENT_METHODS = ['cash','card','upi','online']`; uses `generateIdempotencyKey` + `ApiError`. 546 lines.
- **List actions**: `approveMember`, `deleteMember` (permanent-delete confirm), `updateMember`, `showSubscriptionAction`. `source: SuperadminMembersScreen.tsx:242`.
- **API contract notes** (`src/api/members.ts`): assign/renew/upgrade set `paymentStatus:'pending'`, `isActivePlan:false`; atomic endpoint creates a Payment when `amount`/`method`/`status` are included.

---

## 6. Trainers

- **No dedicated screen** exists for Super Admin.
- **Drawer**: `Trainers` is a **disabled FUTURE_ITEMS** entry (icon `▣`, label "Trainers", `enabled:false`, shows a "Soon" pill). `source: src/components/drawer/SuperadminDrawer.tsx:38-40`.
- Trainer data surfaces in three places only:
  1. Dashboard KPI "Active trainers" (`activeTrainers` in `DashboardStats`).
  2. Branch details **Staff tab** via `getBranchTrainers` → `StaffItem { _id, name, role, status }`. `source: src/screens/BranchDetailsScreen.tsx:232`, `src/api/branches.ts`.
  3. Activity feed `recentActivities`.
- Member form supports assigning a trainer (`getTrainers`). `source: src/components/member/MemberFormModal.tsx`.

---

## 7. Plans

`source: src/screens/SuperadminPlansScreen.tsx` (1243 lines)

- `FlatList` of plan cards; `PlanItem { _id, gymId, name, price, duration, features[], branchCode|null, appliedBranches[], createdAt, __v }`. `source: src/api/plans.ts`.
- **Plan form values**: `{ name, price (string), duration (string, default '30'), features[], featureInput }`; `planToForm` helper for edit.
- **Price display**: `formatPrice` using `en-IN`.
- **Branch application**: `applyPlanToBranch` / `removePlanFromBranch` with per-row busy flags (`isApplying`/`isRemoving`, disabled styles). `source: SuperadminPlansScreen.tsx:649-713`.
- **Delete**: confirm `Alert` — removes all branch assignments, cannot be undone. `source: SuperadminPlansScreen.tsx:223`.
- **Validation**: price cannot be negative (`'Price cannot be negative.'`, line 142); `submitButtonDisabled` states (1145).

---

## 8. Attendance

`source: src/screens/SuperadminAttendanceScreen.tsx` (748 lines)

- **Pagination**: `LIMIT = 20`; `AttendancePage { items, page, limit, total }`.
- **Search**: `SEARCH_DEBOUNCE_MS = 500`.
- **Date sheet**: last `DATE_SHEET_DAYS = 30` days as selectable chips; today labeled "Today" (`formatChipDate`), API param via `toDateParam`.
- **Loading state machine**: `LoadingMode = 'initial' | 'refresh' | 'loadMore' | 'idle'` — includes infinite-scroll load-more.
- **Row data**: `AttendanceItem` with member, `status` (`present|completed|absent|late|half-day`), `checkIn`/`checkOut`, `source` (`app|secret_code|admin|trainer|scanner`), `scanner`, `eventType` (`fingerprint|card|pin|face`), `faceRecognitionMatched`, `location`, `branchCode`, `auditLogs`.
- First/initial-load spinner + centered error with Retry. `source: SuperadminAttendanceScreen.tsx:267`.

---

## 9. Scanners

- **List** `source: src/screens/ScannerListScreen.tsx` (332 lines):
  - `SuperadminHeader` title "Scanners"; for superadmin subtitle is `` `${scanners.length} devices · ${onlineCount} online` `` (else "Access control devices"); **no additive "+" button for superadmin**. `source: ScannerListScreen.tsx:91-102`.
  - KPI row: **Total** (accent) / **Online** (success) cards.
  - Empty state copy differs per role: superadmin sees "Branch admins can register eSSL K30 Pro devices." and **no** "Add scanner" button. `source: ScannerListScreen.tsx:155-171`.
  - Pull-to-refresh `RefreshControl`, error banner w/ Retry.
- **Status color map** (`STATUS_COLORS`): online→success, offline→textMuted, maintenance→`#f59e0b`, disabled→danger. `source: ScannerListScreen.tsx:27`.
- **Detail** `source: src/screens/ScannerDetailsScreen.tsx` (421 lines):
  - `STATUS_OPTIONS = ['online','offline','maintenance']` (disabled excluded).
  - `isSuperadmin = user?.role === 'superadmin'`.
  - **Superadmin = read-only**: admin-only actions `rotateScannerKey`, `disableScanner`/re-enable, sync (eSSL `getSyncPayload`) hidden when `isSuperadmin`; a banner reads: *"Superadmin access is read-only. Ask a branch admin to edit, disable, rotate keys, or sync this device."* `source: ScannerDetailsScreen.tsx:251-252`.
- **Form** `source: src/screens/ScannerFormScreen.tsx` (490 lines):
  - `isSuperadmin` read-only (device-ID note "cannot be changed after registration", disabled save).
  - `PROTOCOLS = ['tcp','usb','p2p']`, `TYPES = ['fingerprint','card','fingerprint_card','face']`; defaults brand `eSSL`, model `K30 Pro`.
- **Entities**: scanning uses `ScannerItem { _id, gymId, branchCode, name, brand, model, deviceId, serial?, ipAddress?, port?, protocol, type, status, gates?, settings?, lastSeen?, lastEventAt?, lastSync?, errorLogs?, apiKey? }`. `source: src/api/scanners.ts`.

---

## 10. Payments

`source: src/screens/SuperadminPaymentsScreen.tsx` (1261 lines)

- **Drawer label**: "Payments & Reminders" (icon ₹) → `SuperadminPayments`. `source: SuperadminDrawer.tsx:42-44`.
- `FlatList` of payments; **WhatsApp receipts** via `Linking` for invoices/reminders; `describeWhatsappFailure` maps failure messages.
- **Actions**: `markAsPaid`, `markAsUnpaid`, `sendReminders`, `getInvoice`, all with `actionLoading`/`reminderLoading` disabled states. `source: SuperadminPaymentsScreen.tsx:759-815`.
- **Analytics strip**: `getAnalyticsOverview` → `AnalyticsKpis { totalRevenue, totalTransactions, paidRevenue, pendingRevenue, pendingPaymentsCount, newMembers, activeMembers, inactiveMembers, renewalsCount, expiringCount, expiredCount }`. `source: src/api/payments.ts`.
- **Helper**: `daysUntilExpiry` for membership expiry.
- **List params**: `PaymentListParams` incl. `status`, `method`, `dateFrom`/`dateTo`, `q`, `branchCode`, `businessStatus`.
- **Row data**: `PaymentItem { _id, invoiceNumber?, amount, method?, status, date?, createdAt?, note?, operationType?, branchCode?, membershipStartDate?, membershipExpiryDate?, member?, plan? }`.

---

## 11. Screen Inventory

Super Admin stack (12 screens):

| Screen | File | Lines | Notes |
|---|---|---|---|
| SplashScreen | `src/screens/SplashScreen.tsx` | 20 | loading splash |
| LoginScreen | `src/screens/LoginScreen.tsx` | 428 | shared, role chips |
| SuperadminDashboard | `src/screens/SuperadminDashboardScreen.tsx` | 726 | own header + branch selector |
| SuperadminBranches | `src/screens/SuperadminBranchesScreen.tsx` | 749 | CRUD + modals |
| BranchDetails | `src/screens/BranchDetailsScreen.tsx` | 422 | shared; overview/KPIs/members/payments/staff |
| SuperadminAdmins | `src/screens/SuperadminAdminsScreen.tsx` | 836 | CRUD + modals |
| SuperadminMembers | `src/screens/SuperadminMembersScreen.tsx` | 864 | list + 2 modals |
| MemberDetails | `src/screens/MemberDetailsScreen.tsx` | 604 | shared; approve/delete |
| SuperadminPlans | `src/screens/SuperadminPlansScreen.tsx` | 1243 | inline plan + branch modals |
| SuperadminAttendance | `src/screens/SuperadminAttendanceScreen.tsx` | 748 | pagination + date sheet |
| SuperadminPayments | `src/screens/SuperadminPaymentsScreen.tsx` | 1261 | actions + WhatsApp |
| ScannerList | `src/screens/ScannerListScreen.tsx` | 332 | read-only for superadmin |
| ScannerDetails | `src/screens/ScannerDetailsScreen.tsx` | 421 | read-only banner |
| ScannerForm | `src/screens/ScannerFormScreen.tsx` | 490 | read-only for superadmin |

Admin-only screens (NOT part of Super Admin stack — do not port them here): `AdminDashboardScreen` (573), `AdminMembersScreen` (826), `AdminMemberDetailsScreen` (597), `AdminPlansScreen` (303), `AdminPaymentsScreen` (1164), `AdminAttendanceScreen` (562), `ScannerIntegrationScreen` (395), `ScannerSetupScreen` (544), `ScannerDetailScreen` (329), `HomeScreen` (98).

---

## 12. Component Inventory

| Component | File | Purpose |
|---|---|---|
| `SuperadminHeader` | `src/components/SuperadminHeader.tsx` | title + subtitle, hamburger `☰` (40×40, radius 12, bg `rgba(30,32,44,0.8)`, border `rgba(255,255,255,0.08)`), optional back `‹`, optional `right`; paddingH 20, paddingV 12 |
| `StatusBadge` | `src/components/StatusBadge.tsx` | pill `borderRadius 999`, borderWidth 1, paddingH 10, paddingV 4, 6px dot, uppercase 11px bold. active→`#2EB872`, inactive→`#E5484D`, pending→`#f59e0b`, expired/cancelled→danger, default→textMuted |
| `SuperadminDrawer` | `src/components/drawer/SuperadminDrawer.tsx` | slide-in Modal drawer (see §17) |
| `SuperadminDrawerHost`/`RoleDrawerHost` | `src/components/drawer/` | mounts drawer for role |
| `DrawerContext` | `src/components/drawer/DrawerContext.tsx` | `DrawerKey` union + `open/close/setActive` |
| `MemberFormModal` | `src/components/member/MemberFormModal.tsx` (670) | create/edit member |
| `MemberSubscriptionModal` | `src/components/member/MemberSubscriptionModal.tsx` (546) | assign/renew/cancel plan |

Inline modal patterns (screen-local): branch form (Branches), admin form (Admins), plan form + branch-apply rows (Plans). Delete confirmations use `Alert.alert` with danger text.

---

## 13. Design System

**Color tokens** `source: src/theme/colors.ts`:

| Token | Value |
|---|---|
| `background` | `#0B0E11` |
| `surface` | `#151A20` |
| `surfaceAlt` | `#1C232B` |
| `border` | `#2A333D` |
| `primary` | `#E11D2E` |
| `primaryDark` | `#B81625` |
| `accent` | `#8b5cf6` |
| `text` | `#FFFFFF` |
| `textMuted` | `#9AA7B4` |
| `textFaint` | `#6B7785` |
| `danger` | `#E5484D` |
| `success` | `#2EB872` |
| `inputBackground` | `#14181E` |
| extra amber | `#f59e0b` (pending/maintenance) |
| drawer bg | `#0d0f16` |
| active row bg | `rgba(139,92,246,0.18)` |

**Typography** (verified points): 11 bold uppercase (badge), 15/600 (drawer labels), 16/800 letterSpacing 2 (brand), 18 (drawer icons), 10 (drawer "Soon"). Full per-screen type scale: `NOT DETERMINED` (style blocks not all read).

**Radius**: 999 (pills), 12 (drawer rows, logo, header button), others `NOT DETERMINED`.

**Icons used**: drawer glyphs `▦ ♢ 👤 ▤ ▧ ◆ ▰ ▣ ₹ ⚙ ↪ ‹ ›`; state glyphs `⚠`. No icon library confirmed (native emoji/glyphs only).

**Charts/analytics visuals**: revenue analytics rendered in dashboard — exact chart style `NOT DETERMINED` from partial reads.

---

## 14. Responsive Behavior

- Drawer width: `Math.min(windowWidth * 0.82, 340)`, max-width 82%. `source: SuperadminDrawer.tsx:51,215`.
- Drawer respects safe-area insets (top+bottom padding). `source: SuperadminDrawer.tsx:100`.
- Lists are `FlatList`/`ScrollView` with `RefreshControl`; content scrolls independently of fixed headers — good pattern for web.
- Headers fixed above scroll regions; modals centered overlays.
- Screen-by-screen breakpoints / landscape behavior: `NOT DETERMINED` (RN `Dimensions`, no explicit breakpoints seen beyond drawer width).

---

## 15. Forms

- **Pattern**: every screen owns a form-state object + `errors` map; validation runs on submit (and on field blur in Login).
- **Validators**: `EMAIL_REGEX`, `BRANCH_CODE_REGEX /^[A-Z0-9][A-Z0-9_-]{1,19}$/`, `DATE_REGEX /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/` (DD/MM/YYYY displayed, converted to `YYYY-MM-DD` for API).
- **Post/put payloads**: `BranchCreatePayload`, `BranchUpdatePayload`, `AdminCreatePayload`, `AdminUpdatePayload`, `PlanCreatePayload { name, price, duration, features? }`, `PlanUpdatePayload`.
- **Submitting UX**: boolean `submitting`/`saving`/`actionLoading`/`reminderLoading` disables buttons (`opacity`-based disabled styles) and prevents double-submit.
- **Idempotency**: subscription modal uses generated idempotency key to avoid duplicate payments.
- **Error surfacing**: fields show inline `fieldError` text; top-level errors via banner/alert. `ApiError` carries `status` + `data`; server `message` sanitized (≤200 chars). `source: src/api/client.ts:44-51`.

---

## 16. States

- **Loading**: `ActivityIndicator` center + text (`"Loading scanners…"`); `LoadingMode` unions `initial|refresh|(loadMore)|idle` per screen.
- **Error**: centered icon `⚠` + message + **Retry** button (list-level); non-blocking error **banner** with Retry when data exists.
- **Empty**: icon + title + subtitle + (role-gated) CTA — e.g. scanners show different copy for superadmin, no CTA.
- **Refresh**: pull-to-refresh via `RefreshControl` tinted `accent`.
- **Disabled/in-progress**: `opacity` styles (`submitButtonDisabled`, `saveButtonDisabled` 0.6, `testButtonDisabled` 0.7); busy rows show no spinner by default (`NOT DETERMINED` where unread).
- **Auth lifecycle**: `restoring | authenticated | unauthenticated`; forced logout when refresh fails (unauthorized handler). `source: src/auth/AuthContext.tsx`.

---

## 17. Nav Map

```
Login ──(role chips: superadmin | admin)──▶ Superadmin stack OR Admin stack
Superadmin stack (12 screens):
  SuperadminDashboard ──┐
  Branches ──▶ BranchDetails{branchId} ──(back + setActive 'Branches')
  Admins
  Members ──▶ MemberDetails{memberId} ──(back + setActive 'Members')
  Plans
  Attendance
  Payments
  Scanners ▸ ScannerList ──▶ ScannerDetails{scannerId}
                              (superadmin: read-only banner)
                              ──▶ ScannerForm{scannerId?} (read-only)
Drawer (Modal, slide-from-left Animated.timing 220ms in / 200ms out):
  MAIN  : Dashboard ▦ · Branches ♢ · Admins 👤 · Members ▤ · Plans ▧ · Attendance ◆ · Scanners ▰
  FUTURE: Trainers ▣ (disabled, "Soon")
  PAYMENTS: Payments & Reminders ₹
  BOTTOM: Settings ⚙ (disabled, "Soon") · Logout ↪ (danger)
Drawer active highlight: accent bg rgba(139,92,246,0.18) + accent border/label.
setActive(...) called on every screen mount so the drawer highlights the current page;
BranchDetails→'Branches', MemberDetails→'Members'.
```

---

## 18. React.js Requirements

Mapping from RN → React (TypeScript) so the new frontend can mirror this exactly:

- **Routing**: replace native-stack with React Router (or React Router DOM v6/v7) route config mirroring the 12-route Super Admin stack + `Login`. Keep `headerShown:false` behavior → each page renders its own header.
- **State**: `useState` equivalents; promote `LoadingMode` to a shared union type; `ApiError` class drives toast/alert text identical to RN `Alert`.
- **Data fetching**: port `src/api/*.ts` service functions 1:1 (fetch wrapper `api.request` with `Bearer` auth, 401 → refresh-token flow, single-flight `refreshing` promise). Replace `AsyncStorage` session with `localStorage`/cookie.
- **UI parity checklist**:
  - Port `colors.ts` tokens verbatim into a CSS variables / theme module.
  - `StatusBadge` → `<span>`/badge component using same color map.
  - `SuperadminHeader` + drawer → CSS slide-in panel (width `min(82vw, 340px)`).
  - `FlatList` → divs with `overflow-y: auto`; `RefreshControl` → optional `onScrollTop` handler or drop (native-mobile gesture).
  - Modals → portal/overlay; same title/message/submit/disabled structure.
  - `SafeAreaView` padding → `env(safe-area-inset-*)` CSS or `padding: 0`.
  - `Linking` (WhatsApp) → `window.open('https://wa.me/...', '_blank')`.
  - Time/currency: reuse `formatINR` (`₹`, `en-IN`), `relativeTime`, `formatShortDate`.
- **Role gating**: gate Add/Edit/Delete controls by `user.role` (superadmin read-only on Scanners; full CRUD elsewhere) exactly as RN does.
- **Not needed**: none of the RN-specific native modules seen in these screens requires e.g. camera/barcode; scanning UI is read-only for superadmin.
- Libraries referenced in RN (`@react-navigation/*`, `react-native-safe-area-context`, `expo-secure-store` for session) → replace with web equivalents; no dependency list for a brand-new React.js app was provided, so exact versions are `NOT DETERMINED`.

---

## 19. Dummy Data

Representative fixtures (fields from `src/api/*.ts` types):

```ts
// Session / User
{ user: { _id:"u_1", gymId:"a1main", branchCode:"MAIN", name:"Mr. Super", email:"super@a1fitness.com",
          phone:"+919800000000", role:"superadmin", status:"active" },
  accessToken:"<jwt>", refreshToken:"<rt>" }

// DashboardStats (branchCode "ALL")
{ totalMembers:1200, activePlans:840, revenue:485500, activeTrainers:34, attendanceToday:142,
  revenueAnalytics:[{ _id:"2026-09", total:52000 }, { _id:"2026-08", total:49800 }],
  recentActivities:[{ text:"Sneha joined Basic Plan", time:"2h ago", color:"#2EB872" }], branchCode:"ALL" }

// Branch
{ _id:"b_1", branchCode:"MAIN", name:"A1 Fitness – Main Road", address:"12, Main Road, Coimbatore",
  phone:"+91 422 100 200", email:"main@a1fitness.com", status:"active" }
// BranchKpis
{ totalMembers:520, activeMembers:440, staff:9, revenue:214000, payments:96, attendance:61,
  activeMemberships:400, expiringMemberships:12, expiredMemberships:18 }

// Admin
{ _id:"a_1", name:"Ravi Kumar", email:"ravi@a1fitness.com", phone:"+919900000001",
  role:"admin", status:"active", branchCode:"MAIN", createdAt:"2026-01-10T09:00:00Z" }

// Plan
{ _id:"p_1", gymId:"a1main", name:"Basic Monthly", price:999, duration:30, features:["Gym access","Locker"],
  branchCode:null, appliedBranches:["b_1","b_2"], createdAt:"2026-01-01T00:00:00Z", __v:0 }

// Member
{ _id:"m_1", secretCode:"1001", branchCode:"MAIN", status:"active", paymentStatus:"paid",
  isActivePlan:true, membershipStartDate:"2026-08-01", membershipExpiryDate:"2026-08-31",
  frozenAt:null, remainingDays:12, createdAt:"2026-08-01T00:00:00Z",
  user:{ _id:"u_2", name:"Sneha", email:"sneha@test.com", phone:"+919800000002" },
  currentPlan:{ _id:"p_1", name:"Basic Monthly", price:999, duration:30, features:["Gym access","Locker"], branchCode:null },
  biometrics:{ deviceUserId:2001, cardId:"CARD2001", fingerprints:["fp01"] } }

// AttendanceItem
{ _id:"at_1", gymId:"a1main", member:{ _id:"m_1", user:{ name:"Sneha" }, secretCode:"1001" },
  date:"2026-09-18", checkIn:"06:10", checkOut:"07:00", status:"present",
  faceRecognitionMatched:true, source:"scanner", scanner:{ name:"Gate-1" }, eventType:"fingerprint",
  branchCode:"MAIN", location:{ lat:11.0, lng:76.9 } }

// Payment
{ _id:"pay_1", invoiceNumber:"INV-2026-0001", amount:999, method:"upi", status:"paid",
  date:"2026-08-01T00:00:00Z", note:"Renewal", operationType:"renew", branchCode:"MAIN",
  membershipStartDate:"2026-08-01", membershipExpiryDate:"2026-08-31",
  member:{ _id:"m_1", user:{ name:"Sneha" } }, plan:{ _id:"p_1", name:"Basic Monthly" } }

// Scanner
{ _id:"sc_1", gymId:"a1main", branchCode:"MAIN", name:"Gate-1", brand:"eSSL", model:"K30 Pro",
  deviceId:"DEV-GATE1", serial:"SN123", ipAddress:"192.168.1.50", port:8090, protocol:"tcp",
  type:"fingerprint_card", status:"online", gates:["Main Entrance"],
  settings:{ enforceMembership:true, enableCheckOutOnSecondScan:false },
  lastSeen:"2026-09-19T04:10:00Z", lastEventAt:"2026-09-19T04:05:00Z", lastSync:"2026-09-19T04:00:00Z",
  errorLogs:[], apiKey:"<hmac-key>" }
```

---

## 20. Unknowns

- **The 22nd section title** from the original request was lost to a truncated earlier message; only 21 titles are recoverable (§0). A provisional §22 is included.
- Production `EXPO_PUBLIC_API_URL` not configured anywhere (empty constant fallback). `source: src/config/api.ts:19-21`.
- Full `StyleSheet.create` values (exact font sizes, paddings, shadows) for the large screens (Payments, Plans, Members, Branches, Attendance, Dashboard) — only heads were read this pass; the crisp per-screen spacing/radius spec is `NOT DETERMINED`.
- Exact status encoding for `PaymentItem.status` and member `paymentStatus` full enum not fully enumerated in this pass.
- Whether Revenue analytics renders as a chart lib or custom bars: `NOT DETERMINED`.
- Scanner `settings.gates` UI and sync payload format (`getSyncPayload`) details not fully read.
- Shadow/elevation styling across cards: `NOT DETERMINED`.

---

## 21. Source-of-Truth

| Concern | File |
|---|---|
| Design tokens | `src/theme/colors.ts` |
| Routes + params | `src/navigation/types.ts` |
| Route → screen mapping / role gating | `src/navigation/index.tsx` |
| Drawer keys + provider | `src/components/drawer/DrawerContext.tsx` |
| Drawer UI (Super Admin) | `src/components/drawer/SuperadminDrawer.tsx`, `RoleDrawerHost.tsx`, `SuperadminDrawerHost.tsx` |
| Header / badge | `src/components/SuperadminHeader.tsx`, `src/components/StatusBadge.tsx` |
| Member modals | `src/components/member/MemberFormModal.tsx`, `MemberSubscriptionModal.tsx` |
| Auth | `src/auth/AuthContext.tsx`, `src/auth/types.ts`, `src/auth/session.ts` |
| API config/client | `src/config/api.ts`, `src/api/client.ts` |
| Data types/endpoints | `src/api/dashboard.ts`, `branches.ts`, `admins.ts`, `members.ts`, `plans.ts`, `attendance.ts`, `payments.ts`, `scanners.ts`, `auth.ts`, `idempotency.ts` |
| Screens (Super Admin) | `src/screens/Superadmin*.tsx` + shared `BranchDetails/MemberDetails/Scanner*` |
| Prior context docs (non-authoritative) | `A1_FITNESS_REPORT_DATA.md`, `DASHBOARD_AUDIT.md`, `LOGIN_AUTH_AUDIT.md`, `PROJECT_REPORT.md`, `REACTJS_CONVERSION_AUDIT.md` |

---

## 22. Appendix — Verification & Open Items (provisional section)

- [ ] Re-read style blocks of the 5 large screens (Payments 1261 / Plans 1243 / Members 864 / Branches 749 / Attendance 748 / Dashboard 726) to complete §13 typography/spacing.
- [ ] Confirm exact `PaymentItem.status` and membership `paymentStatus` enums.
- [ ] Confirm chart rendering for revenue analytics.
- [ ] Confirm the original 22nd section title with the requester and retitle this section.
- [ ] No CORS/HTTPS assumptions made; API base URL must be set for the React.js frontend.
- [ ] Scanner admin-only routes (`ScannerIntegration`, `ScannerSetup`, `ScannerDetail`) deliberately excluded for Super Admin.