# A1 FITNESS DASHBOARD AUDIT

> **Audit only.** Nothing modified. Source of truth for a fresh React.js dashboard implementation.
>
> Status keys: **V** = verified from source · **INFERRED** = reasoned from code · **C/NOT CONFIRMED** = needs verification.
>
> No dashboard code is included in this document.

---

## 1. EXECUTIVE SUMMARY

The existing React Native app has **two near-identical dashboard screens**:

1. **`SuperadminDashboardScreen`** (`src/screens/SuperadminDashboardScreen.tsx`, 726 lines) — global view with a **branch selector** (persisted) that re-fetches all statistics per branch, or "All Branches".
2. **`AdminDashboardScreen`** (`src/screens/AdminDashboardScreen.tsx`, 573 lines) — **branch-locked** view using the logged-in admin's own `branchCode`; no branch selector.

Both render: 5 KPI cards, a hand-built 7-day revenue **bar chart**, a "Recent Activities" list, a header with menu + refresh, pull-to-refresh, a dedicated **"Log out"** button (with an `Alert` confirmation), and full loading/error/empty states. They consume one shared backend endpoint `GET /api/dashboard/stats` (with a different `branchCode` parameter per role), plus the Super Admin version also loads the branch list (`GET /api/branches`).

**Critical observation:** the two screens have identical structure, styles, and helpers. The only functional differences are (a) the branch selector + saved-branch persistence, and (b) the subtitle/branch-badge in the header. The card/format helpers (`formatINR`, `formatShortDate`, `relativeTime`, `KpiCard`, chart, activities) are **duplicated verbatim between the two files** — no shared component module exists.

---

## 2. DASHBOARD ARCHITECTURE

```
App.tsx
   └─ SafeAreaProvider > AuthProvider > StatusBar > RootNavigator (src/navigation/index.tsx)
        └─ status === 'authenticated'
             ├─ role 'superadmin' → Stack [SuperadminDashboard (initial), SuperadminBranches, …]
             └─ role 'admin'      → Stack [AdminDashboard (initial), AdminMembers, …]
        └─ <RoleDrawerHost/> renders AdminDrawer | SuperadminDrawer (slide-in Modal)
```

- **Drawer context** (`src/components/drawer/DrawerContext.tsx`): `isOpen`, `activeKey`, `open/close/setActive`. `setActive` also closes the drawer. Each dashboard calls `setActive('Dashboard')` on mount (`useEffect`).
- **Logout**: `useAuth().logout()` (AuthContext) → fire-and-forget `POST /auth/logout` → `clearSession()` → `status='unauthenticated'` → navigator renders Login. Both the drawer's Logout row and the on-screen "Log out" button first show an `Alert.alert('Log out', 'Are you sure you want to log out?', [Cancel, Log out(destructive)])`.
- **No Socket.IO usage** in either dashboard — refresh is manual only (button, pull-to-refresh, retry).
- **No Redux/Zustand** — local `useState` + custom `useAuth`/`useDrawer` contexts only.

---

## 3. SUPER ADMIN DASHBOARD

### 3.1 Navigation Flow
```
POST /auth/login (role: superadmin)
  ↓
RootNavigator: status='authenticated', user.role='superadmin'
  ↓
SuperadminDashboardScreen (first/initial screen of superadmin Stack)
  ↓
setActive('Dashboard') → drawer highlights "Dashboard"
```
No deep links. The dashboard itself only navigates onward via the **drawer** (see 3.13) or **logout**.

### 3.2 Screen/Component Structure
- Screen: `SuperadminDashboardScreen` (single file — no sub-components imported).
- Local components: `KpiCard` (file-local, not exported/shared).
- Used contexts: `useAuth()` → `{ user, logout }`; `useDrawer()` → `{ open, setActive }`.

### 3.3 UI Layout (actual)
```
┌──────────────────────────────────────────────────┐
│ [☰] A1 FITNESS                      [MAIN ▾] [↻] │   ← headerRow (padding H20, pt12, pb8)
│     Welcome back! Showing data for MAIN.          │
├──────────────────────────────────────────────────┤
│  ScrollView (refreshControl pull-to-refresh)      │
│   (refresh overlay spinner while loading=refresh) │
│  "Dashboard Overview"          (sectionTitle 20/800)│
│  KPI GRID (5 stacked full-width cards, marginB12) │
│   [👥 Total Members]   [📋 Active Plans]          │
│   [💰 Monthly Revenue] [🏋️ Active Trainers]       │
│   [✅ Attendance Today]                           │
│  CARD "Revenue Analytics (Last 7 Days)"           │
│   → horizontal bar chart (height 180) OR empty    │
│  CARD "Recent Activities"                         │
│   → 5 rows: color dot + text + relative time      │
│  [ Log out ] button (danger text)                 │
└──────────────────────────────────────────────────┘
Branch Picker = bottom slide-up Modal (sheet) "Select Branch"
  → All Branches  /  branchName + branchCode rows
```
- All cards: `backgroundColor rgba(30,32,44,0.6)`, `border rgba(255,255,255,0.08)`, radius 16, padding 16. Screen bg `#0a0b10`. Header buttons bg `rgba(30,32,44,0.8)` radius 10–12.
- **Typography:** logo 20/800 primary letterSpacing2; subtitle 13 textMuted; section title 20/800; card title 16/700; KPI label 13/600 textMuted; KPI value 28/800; desc 12 textFaint; chart value 9; chart label 10.
- **Icons:** unicode/emoji — ☰ menu, ▾ chevron, ↻ refresh, ⚠ error, and emoji KPI icons 👥 📋 💰 🏋️ ✅.

### 3.4 Dashboard Sections
1. Header (menu, logo+subtitle, branch button, refresh button)
2. KPI grid "Dashboard Overview"
3. Revenue bar chart card (Last 7 Days)
4. Recent Activities card
5. Logout button
6. Branch Picker modal (super admin only)

### 3.5 Statistics/Cards (5 KPI cards)
| Card | Value source | Desc shown | Extra |
|---|---|---|---|
| Total Members | `stats.totalMembers` | "Registered members" | plain string |
| Active Plans | `stats.activePlans` | "Members with active plans" | |
| Monthly Revenue | `stats.revenue` → `formatINR` | "All Branches Total" if ALL else "Branch Total" | value color `success` |
| Active Trainers | `stats.activeTrainers` | "On system" | |
| Attendance Today | `stats.attendanceToday` | "Check-ins today" | |

`KpiCard` renders: top row `[icon][label]` → value (28/800, optional color) → desc.

### 3.6 Charts
- **Hand-rolled bar chart**, not a charting library. `revenueAnalytics` array → for each `{ _id, total }`:
  - `pct = total / maxRevenue * 100` where `maxRevenue = Math.max(...totals, 1)`
  - `barHeight = total>0 ? Math.max(pct,5) : 0` (min 5% so a bar is visible)
  - bar bg `colors.accent` if total>0 else transparent; `minHeight 8` if >0
  - value text `formatINR(total)` when >0; x-axis label `formatShortDate(_id)` → **MM/DD**
  - `hasRevenueData = length>0 && some(item.total>0)`; empty → `"No revenue recorded for the last 7 days"`
- Chart container: row, align flex-end, height 180, barTrack height 120.

### 3.7 Lists/Tables
- **Recent Activities** only: `stats.recentActivities` sliced to **5**; each row = 10px round dot (`act.color || colors.primary`), text, `relativeTime(act.time)`.
- **Branch list** in the picker modal: all `branches` (name + code), plus "All Branches".
- No tables, no pagination on either dashboard.

### 3.8 API/Data Flow
```
useEffect (restore)
  ├─ getSavedBranch() → SecureStore 'a1fitness.dashboard.branch' (default 'ALL')
  ├─ fetchStats(savedBranch, 'initial') → getDashboardStats(branchCode)
  └─ getBranches() → setBranches(list); branchLoading=false

handleBranchChange(branchCode)
  ├─ setSelectedBranch(branchCode)
  ├─ saveBranch(branchCode)  → SecureStore
  └─ fetchStats(branchCode, 'refresh')

onRefresh → fetchStats(selectedBranch, 'refresh')

fetchStats(branchCode, mode):  setLoading(mode); setError(null)
   getDashboardStats(branchCode) → setStats | setError(msg) | setLoading('idle')
```
- **API calls:**
  - `getDashboardStats(branchCode)` → `GET /dashboard/stats?branchCode=<encoded>` with `{ auth: true }` → `api.request` → returns `{ ...defaultStats, ...res.data }`; on ANY failure throws generic `"Failed to load dashboard data. Please try again."` (client.ts `request` + dashboard.ts:53).
  - `getBranches()` → `GET /branches?limit=100` with `{ auth: true }` → `res.data?.items ?? []`; failures swallowed → `[]`.
  - Branch persistence: SecureStore key `a1fitness.dashboard.branch` (best-effort).
- **Response → UI:** see Section 10 data flow; transformations in 3.10.

### 3.9 State Management
Local `useState` only:
- `stats: DashboardStats | null`
- `loading: 'initial' | 'refresh' | 'idle'`
- `error: string | null`
- `branches: Branch[]`, `selectedBranch: string ('ALL')`, `branchPickerVisible`, `branchLoading`
- `useEffect` once for restore+fetch (deps `[fetchStats]`); `useEffect` for `setActive('Dashboard')`.
- Persisted: selected branch only (SecureStore).

### 3.10 Business Logic
- `formatINR(value)` = `'₹' + value.toLocaleString('en-IN')`.
- `formatShortDate(iso)` = zero-padded `MM/DD`.
- `relativeTime(iso)` = `just now` (<60s, incl. future) → `Xm ago` → `Xh ago` → `Xd ago` (<7d) → `Xw ago`.
- `hasRevenueData`, `maxRevenue`, `barHeight` (chart math, 3.6).
- `activities = recentActivities.slice(0,5)`.
- `selectedBranchName`: 'All Branches' for `ALL`, else `branches.find(code)?.name ?? code`.
- **Note:** the numbers are all computed **backend-side**; the client performs no member/revenue aggregation.

### 3.11 Permissions
- Route registration is **role-based**: `SuperadminDashboard` exists only in the superadmin stack (`navigation/index.tsx:65`). A `user.role==='admin'` can never mount it.
- Backend: `GET /dashboard/stats` route = `protect → authorize("admin","trainer") → branchScope`. Superadmin **bypasses** `authorize` (middleware short-circuit), and `branchScope` lets superadmin pass any `branchCode` (or `ALL`). Bearer token required.
- Applies trainer/member handling only incidentally; trainer responses zero out financial data.

### 3.12 Loading/Error/Empty States
| State | Trigger | UI |
|---|---|---|
| Initial loading | `loading==='initial' && !stats` | centered large spinner + "Loading dashboard…" |
| Refresh loading | `loading==='refresh'` over existing stats | pull-to-refresh spinner (accent) + small overlay spinner |
| Initial error | `error && !stats` | ⚠ icon + `error` text + **Retry** button (primary, calls `onRefresh`) |
| Refresh error (stats already shown) | error set while stats present | **no visible banner** — stale data stays; `error` is stored but unused (V — condition `error && !stats`) |
| Empty revenue | `!hasRevenueData` | "No revenue recorded for the last 7 days" |
| Empty activities | `activities.length===0` | "No recent activity found." |
| Branch list loading | `branchLoading` | branch button shows "Loading…" |
| Branch list failure | `getBranches` catch | `[]` → only "All Branches" appears (no error surface) |

### 3.13 Navigation Actions
- Drawer (SuperadminDrawer) items → routes: Dashboard (`SuperadminDashboard`), Branches (`SuperadminBranches`), Admins (`SuperadminAdmins`), Members (`SuperadminMembers`), Plans (`SuperadminPlans`), Attendance (`SuperadminAttendance`), Scanners (`ScannerList`); separate group "Payments & Reminders" (`SuperadminPayments`); disabled "Trainers" and "Settings" (show "Soon"); bottom **Logout**.
- On-screen "Log out" button → `Alert` confirm → `logout()`.
- Branch picker modal → data re-scope only (no navigation).
- Dashboard cards are **not clickable** — the KPI cards, chart, and activity rows are static views.

---

## 4. BRANCH ADMIN DASHBOARD

### 4.1 Navigation Flow
```
POST /auth/login (role: admin)
  ↓
RootNavigator: status='authenticated', user.role='admin'
  ↓
AdminDashboardScreen (first/initial screen of admin Stack)
  ↓
setActive('Dashboard'); header shows static branch badge
```

### 4.2 Screen/Component Structure
- Screen: `AdminDashboardScreen` (single file, 573 lines — same local `KpiCard`).
- `useAuth()` → `{ user, logout }`; `useDrawer()` → `{ open, setActive }`.
- `branchCode = user?.branchCode || ''` (from the **login session user**, not a separate request).

### 4.3 UI Layout (actual)
Same layout as Super Admin **except** the header right side:
```
┌──────────────────────────────────────────────────┐
│ [☰] A1 FITNESS              [Branch▴ MAIN] [↻]  │   ← branch BADGE (static)
│     Welcome back! Your branch dashboard.         │
├──────────────────────────────────────────────────┤
│  … identical KPI grid, revenue chart, activities,  │
│     Log out button …                            │
└──────────────────────────────────────────────────┘
```
- Header right = static `branchBadge` (Label "Branch" 9px uppercase faint + code 12px accent, max width 160) — **not a button**, no chevron, no modal.

### 4.4 Dashboard Sections
1. Header (menu, logo+subtitle, static branch badge, refresh button)
2. KPI grid "Dashboard Overview"
3. Revenue bar chart card (Last 7 Days)
4. Recent Activities card
5. Logout button

(No branch picker, no `getBranches`, no `getSavedBranch`/`saveBranch`.)

### 4.5 Statistics/Cards
Identical 5 cards; the Monthly Revenue desc is always **"Branch Total"** (no ALL variant).

### 4.6 Charts
Identical hand-rolled 7-day bar chart (same math, labels, empty text).

### 4.7 Lists/Tables
Recent Activities only (sliced to 5), identical markup.

### 4.8 API/Data Flow
```
useEffect → fetchStats('initial') → getDashboardStats(branchCode from session user)
onRefresh → fetchStats('refresh')
```
- **Single API call:** `getDashboardStats(branchCode)` → `GET /dashboard/stats?branchCode=<user.branchCode>` with `{ auth: true }`.
- No branches API, no SecureStore for branch (the branch code is already in the session user).
- Same error wrapping: throws generic "Failed to load dashboard data. Please try again." on any failure.

### 4.9 State Management
`stats`, `loading('initial'|'refresh'|'idle')`, `error` — nothing else. No branch state, no modal state.

### 4.10 Business Logic
Identical helpers `formatINR`, `formatShortDate`, `relativeTime` (duplicated code), same chart math, same `activities.slice(0,5)`. Fetch callback depends on `[branchCode]`, so a session-user change triggers a refetch.

### 4.11 Permissions
- `AdminDashboard` registered only in the admin stack — a `superadmin` never mounts it and an admin cannot mount superadmin screens.
- Backend `authorize("admin","trainer")` explicitly allows `admin` (superadmin bypasses; trainer allowed with hidden finance).
- `branchScope` forces `req.branchCode = user.branchCode` and **rewrites** any incoming `branchCode` query param — the client could pass any value and it would be scoped server-side anyway (V, branchScope.middleware.js:22–25). So the admin dashboard is branch-locked both by the session `branchCode` parameter AND by the backend middleware.

### 4.12 Loading/Error/Empty States
Identical state machine and render branches as Super Admin (4.12 of §3), except there is no branch-list loading state. Same refresh-error quirk (stale data retained, no banner).

### 4.13 Navigation Actions
- Drawer (AdminDrawer) → `AdminDashboard`, `AdminMembers`, `AdminPlans`, `AdminAttendance`, `AdminPayments`, `ScannerList` (all enabled); bottom **Logout**. (No Trainers/Settings items in the admin drawer.)
- On-screen "Log out" → `Alert` confirm → `logout()`.
- KPI cards, chart, activities: static, non-clickable.

---

## 5. SUPER ADMIN vs BRANCH ADMIN COMPARISON

| Area | Super Admin | Branch Admin |
| --- | --- | --- |
| Dashboard route | `SuperadminDashboard` (superadmin Stack, initial) | `AdminDashboard` (admin Stack, initial) |
| Data scope | Global; user-selectable branch or `ALL` | Own branch only (`user.branchCode`) |
| APIs | `GET /dashboard/stats?branchCode=…` + `GET /branches?limit=100` + SecureStore branch persistence | `GET /dashboard/stats?branchCode=<session branch>` only |
| Statistics | 5 KPI cards (Revenue desc: "All Branches Total" / "Branch Total") | Same 5 cards (Revenue desc always "Branch Total") |
| Charts | Same 7-day revenue bars | Same 7-day revenue bars |
| Navigation | Drawer: Dashboard, Branches, Admins, Members, Plans, Attendance, Scanners, Payments & Reminders, + disabled Trainers/Settings | Drawer: Dashboard, Members, Plans, Attendance, Payments & Reminders, Scanners |
| Filters | Branch selector (header button + bottom-sheet modal); persisted (`a1fitness.dashboard.branch`) | None (branch fixed by session) |
| Permissions | Backend: authorize bypass; branchScope allows any branchCode/ALL | Backend: authorize "admin"; branchScope forces own branchCode (query rewritten) |
| Quick actions | Refresh button, pull-to-refresh, branch switch, logout | Refresh button, pull-to-refresh, logout |
| Other differences | Header shows branch **button** (▾); subtitle "…Showing data for {branch}."; second effect loads branches; modal state | Header shows static **badge**; subtitle "…Your branch dashboard."; no extra fetch/effects |
| Identical between both | KPI grid/cards, chart, activities, states, styles, `formatINR/formatShortDate/relativeTime`, "Log out" pattern, no socket, no clickable cards | (same) |

---

## 6. COMPLETE API INVENTORY

| Dashboard | Component | API | Method | Parameters | Data used |
| --- | --- | --- | --- | --- | --- |
| Super Admin | whole screen | `GET /api/dashboard/stats` | GET | auth Bearer; query `branchCode` = `ALL` or a real code (client `encodeURIComponent`) | `totalMembers`, `activePlans`, `revenue`, `activeTrainers`, `attendanceToday`, `revenueAnalytics[]`, `recentActivities[]`, `branchCode` |
| Super Admin | branch picker | `GET /api/branches` | GET | auth Bearer; query `limit=100` (client) | `data.items[]` → `{_id, branchCode, name}` |
| Admin | whole screen | `GET /api/dashboard/stats` | GET | auth Bearer; query `branchCode` = session `user.branchCode` | same as above |

### Response structure (dashboard.stats — verified from `dashboard.controller.js:111`)
```json
{
  "success": true,
  "message": "Dashboard stats fetched",
  "data": {
    "totalMembers": 0,          // Member.countDocuments({gymId, branch?})
    "activePlans": 0,           // Member.countDocuments({..., isActivePlan:true})
    "revenue": 0,               // sum of paid Payment.amount (0 for trainers)
    "activeTrainers": 0,        // User.countDocuments({role:'trainer', branch?})
    "attendanceToday": 0,       // Attendance count today (not deleted)
    "revenueAnalytics": [       // [] for trainers
      { "_id": "YYYY-MM-DD", "total": 0 }   // last 7 days, sorted asc
    ],
    "recentActivities": [       // ≤5
      { "text": "New member: …", "time": "<ISO>", "color": "var(--clr-primary)" },
      { "text": "Payment of ₹… from …", "time": "<ISO>", "color": "var(--clr-success)" },
      { "text": "… checked in", "time": "<ISO>", "color": "var(--clr-secondary)" }
    ],
    "branchCode": "MAIN | ALL"
  }
}
```
- Cached 15s in Redis when available (`cacheKey = dashboard:stats:{gymId}:{branch|all}`); cache hit message "Dashboard stats fetched (cache)".
- Error responses: standard envelope `{ success:false, message, code, data }`; 401 missing/invalid token, 403 forbidden/member, 400/500 as applicable.
- **Important quirk (V):** `recentActivities[].color` is a **CSS custom-property string** (`"var(--clr-primary)"`, `"var(--clr-success)"`, `"var(--clr-secondary)"`) — invalid in React Native, so the RN dot color never actually renders (falls through; `colors.primary` fallback only triggers when `act.color` is falsy). **For the web rebuild, map these to real values** (e.g. primary `#E11D2E`, success `#2EB872`, secondary/accent `#8b5cf6`) — **C/confirm** the intended semantic mapping.
- "Recent Activities" data: last-3 members + last-3 payments + last-3 attendances, merged, sorted desc by `time`, sliced to 5. Text templates and time source (`createdAt` vs `checkIn`) are backend-owned (V, dashboard.controller.js:93–109).

### Request headers (client)
All requests `{ auth: true }` → `Authorization: Bearer <accessToken>`, `Content-Type: application/json` (client.ts). Cookies unsent by RN client (refresh via body).

---

## 7. COMPLETE COMPONENT INVENTORY

| Component | Location | Purpose |
| --- | --- | --- |
| `SuperadminDashboardScreen` | `src/screens/` | Full super admin dashboard (header, KPI, chart, activities, logout, branch modal) |
| `AdminDashboardScreen` | `src/screens/` | Full admin dashboard (same minus branch modal/badge) |
| `KpiCard` (local, defined in BOTH files) | file-scoped | One statistic card: icon+label row, value, desc, optional color |
| `SafeAreaView` (react-native-safe-area-context) | both | Top/bottom safe padding |
| `ScrollView` + `RefreshControl` | both | Scroll + pull-to-refresh (accent tint) |
| `Alert.alert` (confirmation) | both | Logout/`Log out` confirm dialog |
| `Modal` + sheet | super admin only | Branch picker bottom sheet |
| `DrawerProvider` / `useDrawer` / `DrawerContext` | `src/components/drawer/` | `isOpen`, `activeKey`, `setActive('Dashboard')` |
| `AdminDrawer` / `SuperadminDrawer` / `RoleDrawerHost` | `src/components/drawer/` | Slide-in side menu per role; active highlight; branch badge in AdminDrawer |
| `useAuth` (AuthContext) | `src/auth/` | `user`, `logout`, `status`; session user drives `branchCode` |
| `api.request` (client.ts) | `src/api/` | HTTP envelope, bearer, 401-refresh |

---

## 8. STATE MANAGEMENT INVENTORY

| Concern | Mechanism |
| --- | --- |
| Dashboard data (stats) | local `useState` per screen |
| Loading mode | local `useState<'initial'|'refresh'|'idle'>` |
| Error | local `useState<string|null>` |
| Branch selection (super admin) | local `useState` + SecureStore (`a1fitness.dashboard.branch`) |
| Branch list + picker | local `useState` + `useState(visible)` |
| Auth/session/user | `AuthContext` (`status`, `user`, `busy`, `login`, `logout`) |
| Drawer open/active | `DrawerContext` (`isOpen`, `activeKey`) |
| Global state libs | **none** (no Redux/Zustand/MobX) |
| Caching | backend Redis (15s dashboard stats); client caches nothing but the branch code |
| Token handling | via `api/client.ts` (bearer + 401 single-flight refresh); transparent to dashboard screens |

---

## 9. NAVIGATION MAP

```
Login (unauthenticated)
  │
  └─(role)─▶ SuperadminDashboard  ← initial  ·  AdminDashboard  ← initial
               │                                  │
Drawer options │                                  │ Drawer options
  ├─ Branches        SuperadminBranches          ├─ Members   AdminMembers
  ├─ Admins          SuperadminAdmins            ├─ Plans     AdminPlans
  ├─ Members         SuperadminMembers           ├─ Attendance AdminAttendance
  ├─ Plans           SuperadminPlans             ├─ Payments  AdminPayments
  ├─ Attendance      SuperadminAttendance        └─ Scanners  ScannerList
  ├─ Scanners        ScannerList
  ├─ Payments ▸      SuperadminPayments
  ├─ Trainers (disabled "Soon")
  ├─ Settings (disabled "Soon")
  └─ Logout → Login
```
- Protected screens: every screen in both stacks unreachable until `status==='authenticated'`; role-specific stacks are the only "guard".
- Nested nav: none (single flat native stack per role + overlay drawer).
- Deep links: none.

---

## 10. DATA FLOW DIAGRAM

```
UI (header, cards, chart, activities, modal)
  │  user taps refresh / picks branch / pull-to-refresh
  ▼
Screen callback (onRefresh / handleBranchChange)  → setLoading('initial'|'refresh')
  ▼
src/api/dashboard.ts  getDashboardStats(branchCode)  (auth:true)
  ▼
src/api/client.ts request():
  GET {API_BASE_URL}/dashboard/stats?branchCode=<encoded>
  Authorization: Bearer <accessToken>  ;  on 401: single-flight refresh + retry once
  ▼
server rtr dashboard.routes.js: GET /stats → protect → authorize("admin","trainer") → branchScope → getStats
  ▼
dashboard.controller.getStats:
  branchFilter/trainerFilter/paymentMatch/attendanceMatch → Promise.all of 7 queries
  → cache check (Redis 15s, key dashboard:stats:{gymId}:{branch|all}) → setCache
  → sendResponse({ success, message, data })
  ▼
client.parseResponse → api.request returns body →
getDashboardStats merges { ...defaultStats, ...res.data }  (arrays default [])
  ▼
setStats(data) → render:
  → formatINR(revenue)  ·  String(totalMembers) …  → KpiCard
  → revenueAnalytics → hasRevenueData/maxRevenue/barHeight → bar chart
  → recentActivities.slice(0,5) → relativeTime(time) + color dot → activity rows
```

---

## 11. REACT NATIVE → REACT.JS CONCEPTUAL MAPPING

| React Native | React.js/Web concept |
| --- | --- |
| `View` | `<div>` / `<section>` / flex containers |
| `ScrollView` | scrollable `<main>` (page scroll) |
| `FlatList`/`map` over `View` rows | `<ul>/<li>` list or CSS grid |
| `TouchableOpacity` | `<button>` / `<a>` with hover/active states |
| `SafeAreaView` | page padding, `env(safe-area-inset-*)` |
| `Modal` (bottom sheet) | `<dialog>` / overlay + panel (or dropdown menu) |
| `Alert.alert` | `<dialog>` confirm modal / `window.confirm` |
| `RefreshControl` | explicit Refresh button (no pull-to-refresh on desktop) |
| `StyleSheet` | CSS modules / plain CSS / Tailwind |
| `colors.*` tokens | CSS custom properties (same hex values) |
| unicode/emoji icons | text icons / an icon library (keep glyphs) |
| `Text` hierarchy | heading/p/span with type scale |
| `ActivityIndicator` | CSS spinner |
| `Dimensions.get('window')` | CSS viewport / media queries |
| React Navigation stack + drawer | React Router routes + sidebar layout |
| `useAuth`/`useDrawer` contexts | React Context or Zustand (same contract) |
| SecureStore (`dashboard.branch`) | `localStorage` key `a1fitness.dashboard.branch` |

---

## 12. RESPONSIVE WEB CONSIDERATIONS

### Existing RN behavior (facts, do not change intent)
- KPI grid is **5 stacked full-width cards** (single column, `flexDirection` default) — no multi-column grid exists.
- Bar chart is **7 bars in a horizontal row** (`flexDirection:'row'`, `justifyContent:'space-between'`, barWrapper `flex:1`) — bars shrink with available width.
- Header is a **single horizontal row** (menu | logo+subtitle | right controls), subtitle can wrap/truncate, branch button truncates (`numberOfLines={1}`, maxWidth 160).
- Scroll content is single-column; padding bottom 40; horizontal padding 20.
- Row layouts (activities) are `flexDirection:'row'`.

### Web implementation considerations (recommended — NOT existing behavior)
- Turn the 5-card stack into a **responsive grid** (e.g. auto-fit minmax) — stacks to 1 col on mobile, 2 on tablet, 3–5 on desktop. *Keep the same cards/order.*
- Revenue chart: map bars to CSS/HTML bars with `flex` widths, or a configured chart library; preserve the same 7-day grouping and ₹ labels.
- Header → responsive top bar: sidebar on desktop stays visible; on tablet/mobile collapse to overlay drawer (view menu button) matching the modal drawer pattern.
- Branch selector (super admin) → dropdown on desktop; keep an equivalent bottom-sheet/dropdown on mobile.
- KPI value sizes scale with container (28px fixed is sized for mobile).
- Emoji/unicode icons remain cross-platform; verify contrast on web.
- Everything above is an **adaptation recommendation**, not a change to the product's content or logic.

---

## 13. CONFIRMED REQUIREMENTS FOR REACT.JS DASHBOARD

Implementation checklist (only what exists in the RN app):

- [ ] **Super Admin dashboard** screen (initial route after superadmin login)
- [ ] **Branch Admin dashboard** screen (initial route after admin login)
- [ ] Auth-gated routes; role determines which dashboard is presented
- [ ] Header: menu button, "A1 FITNESS" logo, subtitle, refresh (`↻`) button
- [ ] Super Admin: branch selector button (name + ▾) → selection list incl. "All Branches"
- [ ] Super Admin: branch selection persisted across sessions (web: `a1fitness.dashboard.branch` in localStorage)
- [ ] Admin: static branch badge (LABEL "Branch" + code) — not clickable
- [ ] KPI grid "Dashboard Overview" — 5 cards: Total Members / Active Plans / Monthly Revenue / Active Trainers / Attendance Today (with exact labels, descs, icons, revenue formatted ₹ en-IN, revenue value in success color)
- [ ] Card styling: `rgba(30,32,44,0.6)` bg, `rgba(255,255,255,0.08)` border, radius 16
- [ ] "Revenue Analytics (Last 7 Days)" bar chart (max-relative bar heights, min 5%/8px, accent bars, per-bar ₹ value, MM/DD labels)
- [ ] Empty chart state: "No revenue recorded for the last 7 days"
- [ ] "Recent Activities" list — top 5, dot + text + relative time (`just now/Xm/Xh/Xd/Xw`) + color; dot color mapped from backend "var(--clr-…)" strings **C**
- [ ] Empty activities state: "No recent activity found."
- [ ] Loading state: cental spinner + "Loading dashboard…"
- [ ] Initial error state: ⚠ + message + Retry button
- [ ] Pull/manual refresh re-fetch with the same branch scope; refresh indicator overlay
- [ ] "Log out" button (danger) + confirmation dialog + drawer Logout
- [ ] Drawer per role with exact item sets and disabled "Soon" items (Trainers + Settings super admin only)
- [ ] Drawer active highlight "Dashboard"; `setActive('Dashboard')` on mount
- [ ] Use `GET /api/dashboard/stats?branchCode=…` (bearer auth) — super admin passable branch/ALL, admin session branch
- [ ] Super Admin also fetches `GET /api/branches?limit=100` for the picker
- [ ] Generic client error fallback: "Failed to load dashboard data. Please try again."
- [ ] Token/401 behavior via existing auth layer (single-flight refresh, retry once)
- [ ] No clickable KPI cards; no in-dashboard navigation

---

## 14. UNKNOWN / NEEDS VERIFICATION

- **C** — Semantic mapping of `recentActivities[].color` values (`var(--clr-primary)` / `--clr-success` / `--clr-secondary`) to concrete hex for the web (proposed: primary `#E11D2E`, success `#2EB872`, secondary/accent `#8b5cf6`).
- **C** — `activeTrainers` counts Users with `role:'trainer'` scoped by branchFilter; confirm trainers carry a `branchCode` in practice (they do per `User` model default "MAIN").
- **C** — `revenue` and `revenueAnalytics` are derived from `Payment.status:'paid'` matching the **member's current branch** (`member: {$in: memberIdsInBranch}`); confirm intended behavior for re-assigned members (backend comment says payments follow the member).
- **C** — Refresh-error while data is already shown has no visible banner (stale data retained). Confirm this is acceptable for the web version (recommend adding a subtle "refresh failed" toast — would be a new behavior, listed in §15).
- **C** — `attendanceToday` counts only non-deleted check-ins within today (23:59:59); timezone is server-local (IST assumption in report docs). Confirm timezone handling.
- **C** — The dashboards do **not** subscribe to Socket.IO `attendance:*` / `member:updated` events today (manual refresh only). Confirm the web version should mirror this or use realtime (new behavior → §15).
- **C** — No screenshots exist; visual proportions above are reconstructed from styles, not pixels (layout is code-derived).
- **Not confirmed** — any performance/measurement claims (none in code).

---

## 15. OPTIONAL FUTURE IMPROVEMENTS

Explicitly NOT part of the confirmed requirements (owner opt-in only):
- Refresh-failed toast/banner when data is already rendered (stale-data indicator).
- Real-time dashboard updates via existing Socket.IO events (`attendance:*`, `member:updated`) instead of manual refresh.
- Clickable KPI cards / chart → quick navigation into Members, Payments, Attendance lists.
- Multi-column KPI grid + proper responsive chart on web (adaptation of existing single-column layout).
- Pull-to-refresh equivalent on touch web (currently only a button exists).
- Notifications/announcements widget on the dashboard (no existing data source in these screens).

---

**NEXT STEP (after approval):** Build the **Super Admin and Branch Admin dashboards** in the fresh React.js project strictly from §13's confirmed checklist.