# A1 FITNESS — PAYMENTS AUDIT

**Project:** A1 Fitness React Native app (Expo / RN / TypeScript frontend + Node.js/Mongoose backend, Express)
**Audit date:** 19 Sep 2026
**Scope:** Payments & Reminders feature, Super Admin + Branch Admin behavior. **Investigation only — no code was modified.**
**Goal:** Source-of-truth for a fresh **React.js** implementation (initially with dummy data), matching UI, roles, states, API contract, and behavior.

---

## 1. Executive Summary

The Payments feature is a **two-role dashboard** with a shared structure:

- `SuperadminPaymentsScreen.tsx` (1,261 lines) — full app view. Header shows **selected branch name** ("All Branches" default) with an inline **branch-selector pill + refresh** in the header; a **Payments / Reminders (n)** segmented toggle; a **period** filter (Today / This Month / This Year) + **invoice search**; a 2×2 **KPI grid** (Total ₹ / Paid count / Pending count / Expiring count); a paginated **payment card list**; and an **invoice bottom-sheet modal**.
- `AdminPaymentsScreen.tsx` (1,164 lines) — identical except **no branch selector** (hard-locked to the admin's own branch via `user.branchCode`), header subtitle is the branch code, and no branch picker modal. Reminder "Send Reminders" is scoped to the admin's branch.

Backend strengths: full auth (`protect`), role gating (`authorize` with superadmin passthrough), **branch scope** (non-superadmin locked to own branch; superadmin via `?branchCode=`), **trainer isolation**, member-current-branch payment scoping, idempotent term-payment dedupe, audit-supported status flips (`PATCH /:id/paid`|`/unpaid`), invoice JSON **and** PDF (pdfkit), WhatsApp/in-app reminder dispatch with a detailed summary.

Key semantics (server-verified):

- **Card meanings:** `Total` = **sum of payment amounts** in the selected period (`kpis.totalRevenue`); `Paid` = **count** of `paid` payments in the period (`breakdowns.paymentsByStatus['paid'].count`); `Pending` = **count** of `pending` payments (`['pending'].count`); `Expiring` = **member count** with `membershipExpiryDate` inside `[periodEnd, periodEnd+14d]` (`kpis.expiringCount`).
- **Statuses:** only `paid` and `pending` exist in the Payment model; the shared `StatusBadge` colors `paid` as **muted/grey** (no explicit branch) and `pending` as amber (`#f59e0b`). (Screenshot shows "● PAID" rendered grey — see §13.)
- **Reminders** are derived **client-side** from the currently loaded payments (`status === 'pending'` OR expiry ≤ 7 days) for the tab badge/list; the actual "Send Reminders" hit `POST /payments/reminders`, which recomputes eligibility server-wide (pending payment OR expiry within env `REMINDER_WINDOW_DAYS` = 7) and can send in-app + WhatsApp.

Notable gotchas (details in §34): KPIs and the Reminder badge only reflect **loaded pages**, not server totals; refresh errors are silently swallowed after first success; `markAsPaid/markAsUnpaid` update the card status **but not the KPIs** until refetch; online-payment endpoints are intentionally stubbed with 501.

---

## 2. Source Files

| File | Lines | Role |
|---|---|---|
| `src/screens/SuperadminPaymentsScreen.tsx` | 1,261 | Super Admin dashboard (branch picker + list + invoice modal) |
| `src/screens/AdminPaymentsScreen.tsx` | 1,164 | Branch Admin dashboard (own-branch only) |
| `src/api/payments.ts` | 331 | Payment/analytics/invoice/reminder client + all types |
| `src/api/dashboard.ts` | 84 | `getBranches()` + `Branch { _id, branchCode, name }` (used by SA screen) |
| `src/api/client.ts` | — | HTTP wrapper (`api.request<T>` handles auth + unwraps `{ success, message, data }`) |
| `src/components/SuperadminHeader.tsx` | — | Shared header chrome (hamburger via `useDrawer`, title, subtitle, `right` slot) |
| `src/components/StatusBadge.tsx` | 45 | Shared status pill used on payment cards |
| `src/components/drawer/{SuperadminDrawer,AdminDrawer,DrawerContext}.tsx` | — | Drawer nav; both list `{ key:'Payments', label:'Payments & Reminders', icon:'₹', route:'SuperadminPayments'|'AdminPayments' }` |
| `src/navigation/types.ts` / `src/navigation/index.tsx` | — | Route registry (drawer routes) |
| `src/auth/AuthContext.tsx` | — | `user.branchCode` for the admin lock |
| `server/routes/payment.routes.js` | 35 | Payment endpoints |
| `server/controllers/payment.controller.js` | 721 | Payments CRUD + list + invoice (+PDF) + status flips + online (stubbed) |
| `server/controllers/reminder.controller.js` | 145 | `POST /payments/reminders` |
| `server/controllers/analytics.controller.js` | 774 | `GET /analytics/overview` (KPI source) |
| `server/models/payment.model.js` | 44 | Payment schema |
| `server/services/reminder.service.js` | 620 | Eligibility + in-app/WhatsApp dispatch engine |
| `server/services/paymentStatusFilter.service.js` | 78 | PAID/PENDING/EXPIRING business buckets (`businessStatus`) |
| `server/services/invoiceDelivery.service.js` | 50 | Subscription gate for email/WhatsApp invoice send |
| `server/jobs/expiryReminder.job.js` | 56 | Cron-style expiry reminders |
| `server/routes/analytics.routes.js` | 19 | `/analytics/overview` mount |

The `reminder.model` does **not exist** — reminders are computed; dedupe is tracked via the `Notification` model (in-app) and a WhatsApp log collection.

---

## 3. Payments Screen Architecture

```
Payments Screen (Shared skeleton — both roles)
│
├── SafeAreaView (#0a0b10)
│   ├── SuperadminHeader
│   │   ├── Hamburger (OpenDrawer via useDrawer)
│   │   ├── Title: "Payments"
│   │   ├── Subtitle: SA → selected branch name ; Admin → admin branchCode
│   │   └── Right slot
│   │       ├── [SA only] Branch pill  → Branch picker modal
│   │       └── Refresh button (↻)     → fetchData('refresh')
│   ├── View-mode segmented toggle
│   │   ├── Payments
│   │   └── Reminders (n)              ← n = client-computed eligible count
│   ├── Filter row
│   │   ├── Period pill ("This Month ▾") → Period picker modal
│   │   └── TextInput "Search invoices..." (payments mode only, 500ms debounce)
│   ├── Content gate
│   │   ├── initial & !analytics → full spinner "Loading payments..."
│   │   ├── error & !analytics    → ⚠ error + Retry
│   │   └── payments mode →
│   │       FlatList
│   │       ├── ListHeader: KPI 2×2 grid + "Payment Records (N)"
│   │       ├── PaymentCard × N
│   │       ├── ListEmpty: ₹  + "No payments found for this period."
│   │       └── ListFooter: Load More (button) | "End of list"
│   │   └── reminders mode →
│   │       FlatList (of client-filtered payments)
│   │       ├── ListHeader: Send Reminders button + result box + "Eligible Members (N)" + sub-blueprint
│   │       ├── ReminderCard × N (days-left badge + Send Reminder→wa.me)
│   │       └── ListEmpty: ✓ + "No members need reminders right now."
│   └── Modals: Period picker, [SA] Branch picker, Invoice sheet
```

**Same component code in both screens** (duplicated): `PaymentList`, `PaymentCard`, `ReminderList`, `KpiCard`, `InfoRow`, `InvoiceContent`, plus the two picker/sheet modals (branch picker only in SA). There is **no** shared `PaymentsScreen` abstraction in RN.

---

## 4. Header

| Aspect | Super Admin | Branch Admin |
|---|---|---|
| Component | `SuperadminHeader` (shared) | `SuperadminHeader` (shared) |
| Title | `Payments` (fontSize 22, weight 800, `colors.text`) | `Payments` (identical) |
| Subtitle | `branchName` (defaults `"All Branches"`) | `user?.branchCode || "MAIN"` (own branch code) |
| Left | Hamburger (opens drawer, sets active Payments) | Hamburger (identical) |
| Right slot | **Brand name pill** (`branchName + ' ▾'`) **AND refresh** button | **Refresh only** |
| Header color | `#0D1117` | `#0D1117` |

- Subtitle style: fontSize 13, `colors.textMuted`; paddingHorizontal 16, paddingVertical 14.
- The header is shared across all Superadmin/Admin screens (`src/components/SuperadminHeader.tsx`) — verified in prior UI audit.
- Background `#0D1117`, matching the surface family used app-wide.

---

## 5. Branch Selector

**Super Admin only.**

- Trigger: the header-right **pill** (`branchName + ' ▾'`, accent border + accent text). Default value `"All Branches"`.
- Tap → **bottom-sheet Modal** (`80%` max height, `transform translateY` slide, backdrop `#00000066`).
- Content: title **"Choose Branch"**, a text **search field** ("Search Branch"), and a scrollable list of branches (`branch.name`), each row with an accent `✓` when selected.
- Each row: `branch.name` (fontSize 14, 600) and a `branchCode` sub-line (fontSize 12, `colors.textFaint`).
- List is scrollable with its own `FlatList`; search filters by `branchCode`/`name` includes.
- Rows sorted by `name` (locale compare).
- Selection logic (`handleBranchSelect`):
  - `"ALL"` → `branchCode = "ALL"`, `branchName = "All Branches"` → `getAnalyticsOverview()` (no branch param).
  - otherwise → `branchCode = b.branchCode`, `branchName = b.name` → `getAnalyticsOverview(branchCode)`.
  - Both cases set `page = 1` and trigger `load('refresh')`; modal closes.
- Values come from `getBranches()` (`src/api/dashboard.ts` → `GET /branches?limit=100`), loaded once in a `useEffect`; failure silently ignored (`catch(() => {})`).
- On **screen focus**, the previously saved branch is re-applied from the drawer context (`setActive('SuperadminPayments')`) — branch state resets to the saved drawer branch on navigation.

**Branch Admin:** no selector anywhere; all calls hard-code the admin's branch (`user.branchCode`).

**Trainer:** has no Payments screen (see §24, §27).

---

## 6. Refresh

- **Trigger:** header `↻` button (`right` slot) on both roles → `load('refresh')`.
- Also implicit: switching tabs, switching period, updating search (debounced 500ms), branch change (SA), and `onCreate` after a payment creation yields (member-side flow).
- **Pull-to-refresh:** FlatLists are wrapped in `RefreshControl` (tint = `colors.accent`) when a **branch is selected**/scoped.
- Behavior: keeps the current scroll/list, resets `page = 1`, refetches **both** the payment list and the analytics in parallel. No visual spinner overlay during refresh (list stays interactive); the Load More footer shows a spinner if visible.
- Gotcha: analytics and list are refetched independently — if the analytics call fails during a refresh while data is already present, the error is invisible (the error screen only renders when `analytics == null`). See §23.

---

## 7. Payments / Reminders Tabs

- Segmented **toggle** (not a tab navigator): two buttons beside each other, active one filled `colors.primary` with white text; inactive = transparent pill with `colors.textMuted`.
- Labeled **"Payments"** and **"Reminders (n)"** where `n = reminderItems.length` (see §16). In the reference screenshot (`Reminders (1)`).
- Switching tabs does **not** refetch anything — the reminders view is a **client-side filter of the already-loaded payment list**.
- `ViewMode = 'payments' | 'reminders'` state.

---

## 8. Date / Period Filter

- Period options (constant `PERIODS`): **Today**, **This Month**, **This Year**. Default: **This Month**.
- Trigger: pill showing `"This Month ▾"` → bottom-sheet **Select Period** modal (`60%` height) with the three options; active row gets accent color; tap selects, closes, sets `page = 1`, refetches list + analytics.
- Client maps selection → `{ dateFrom, dateTo }`:
  - Today → `dateFrom = dateTo = now`
  - This Month → `dateFrom = startOfMonth(now)`, `dateTo = now` (end = today, **not** month end)
  - This Year → `dateFrom = startOfYear(now)`, `dateTo = now`
- These become the **`dateFrom` / `dateTo`** query params for **both** `GET /payments` (list) and `GET /analytics/overview` (KPIs). Server (`analytics.parseRange`) uses start-of-day for `dateFrom` and end-of-day for `dateTo` (period = UTC-midnight boundaries run to 23:59:59.999 of `dateTo`).
- Advisory: "Today" yields KPI money sums for current day only; the `Expiring` KPI (§10) is windowed to `+14 days after dateTo`.

---

## 9. Search

- Only in **Payments** mode. `TextInput` placeholder **"Search invoices..."** (icon 🔍 `colors.textFaint`).
- Debounced **500ms**; queries `GET /payments?q=...` (server builds a regex `i` across `invoiceNumber`, member name, phone, email — see §17/§18).
- On query change: `page = 1`, refetch list (analytics **unaffected** by search).
- Reminders mode has no search field.
- The client always filters/sorts server-side — the RN list renders exactly `total` items server returns for the query.

---

## 10. Summary Cards (KPIs)

2×2 grid (flexWrap), rendered from the **analytics overview response** (`GET /analytics/overview`):

| Card | Value shown | Data field | Formatting |
|---|---|---|---|
| **Total** | ₹ sum of all payment **amounts** in period | `kpis.totalRevenue` | `'₹' + n.toLocaleString('en-IN')`, fontSize 22 bold, on `colors.accent` |
| **Paid** | **count** of `paid` payments in period | `breakdowns.paymentsByStatus.find(_id==='paid').count` | plain number, `colors.success` (green) |
| **Pending** | **count** of `pending` payments in period | `breakdowns.paymentsByStatus.find(_id==='pending').count` | plain number, `#f59e0b` (amber) |
| **Expiring** | **member count** expiring `[periodEnd, periodEnd+14d]` | `kpis.expiringCount` | plain number, `colors.primary` (red) |

Card shell: surface `#151A20`, title fontSize 12 `colors.textMuted`, value fontSize 22 weight 800, borderRadius 12, padding 14. Fallbacks: all `?? 0`.

Server derivation (`analytics.controller.js — getReportOverview`):
- `paymentsPipeline` = `Payment` filtered by `{gymId, date ∈ [start,end]}` (+ plan/status/method when passed) **and**, when `branchCode` set, joined via `$lookup` on `members._member.branchCode`.
- `totalRevenue` = `Σ $amount` (group `_id:null`), `revenueByStatus` groups by `$status` → `paid`/`pending` totals & **counts**; `paymentCounts` groups by `$status` → this IS `breakdowns.paymentsByStatus` (counts).
- `expiringCount` = `Member.countDocuments({ ...memberBaseMatch, membershipExpiryDate: { $gte: end, $lte: end+14d } })`.
- Trainer isolation: if `req.user.role === 'trainer'`, `memberBaseMatch.trainer = req.user._id` (no Payments screen exists for trainers, but the API is trainer-capable; per-member payment scoping then applies).
- So `Paid`/`Pending` are **payment counts**, `Total` is **money**, `Expiring` is a **member count**. The labels on the screenshot ("PAID 2", "TOTAL ₹4,054", "EXPIRING 1") are consistent with this.

---

## 11. Payment Record Card

Per row in the payments list (`PaymentCard`):

| Section | Field | RN Data Field | Render |
|---|---|---|---|
| Header | Member name | `member?.user?.name ?? 'Unknown'` | fontSize 15, 700, `colors.text`, icon 👤 avatar circle (initials) |
| Header | Status pill | `status` | `StatusBadge` (see §13) |
| Header right | Invoice no. | `invoiceNumber \|\| '---'` | monospace, `#D9A404`/accent-ish, weight 700, lowercase-ish |
| Header right | Invoice button | — | `Invoice →` accent text, tap → invoice modal (§15) |
| Body | Plan | `plan?.name ?? 'Manual'` | left "Plan" grey label + bold value; right "Amount" `formatINR(amount)` accent bold (₹ 355) |
| Body | Amount | `amount` | see above |
| Divider row | Payment Date | `formatDate(date \|\| createdAt)` e.g. `19 Sept'26` | `InfoRow` |
| Divider row | Branch (SA only) | `member?.branchCode ?? branchCode ?? '---'` | `InfoRow` (Admin: hidden) |
| Divider row | Method | `(method \|\| 'cash').toUpperCase()` | `InfoRow` (e.g. `UPI`) |
| Divider row | Start | `formatDate(membershipStartDate)` | `InfoRow` |
| Divider row | Expiry | `formatDate(membershipExpiryDate)` | `InfoRow`, red if `daysUntilExpiry ≤ 7` |
| Divider row | Type | `operationType?.toUpperCase()` (assign/renew/upgrade) | `InfoRow` |
| Footer actions | Mark Unpaid / Mark Paid | — | `onTogglePaymentStatus` (§14); grey text button, pressed → accent |
| Card style | — | — | surface `#151A20`, border `#20262C` 1, radius 12, padding 14, marginBottom 12 |

`formatDate(d)` = `d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'2-digit' })` → e.g. `2 Sep'26`.
`formatINR(v)` = `'₹' + v.toLocaleString('en-IN')`.

---

## 12. Member Avatar

- Rendered inside each payment card header: circular **(43×43)** `colors.inputBackground` circle, initials text (`member?.user?.name` → first letters of first+last words, uppercase, **2 chars**, fontSize 16 white, weight 600).
- Not a tappable navigation target — purely decorative on the Payments screen (there is no per-member drill-down from here).

---

## 13. Payment Status

- Model enum: **`paid` | `pending`** (`payment.model.js`); default `paid`.
- Rendered via the shared `StatusBadge` (`src/components/StatusBadge.tsx`): bordered pill + dot + uppercase label.
- `resolveColor`:
  - `pending` → **amber `#f59e0b`**
  - `active` → green `colors.success`; `inactive` → `colors.danger`
  - `expired`/`cancelled` → `colors.danger`
  - **anything else (incl. `paid`) → `colors.textMuted` (grey), no explicit branch.**
- So in code, "PAID" badges render **grey**, not green — that is the confirmed RN behavior to replicate in React.js.
- Payments are flipped between the two enum values via `PATCH /payments/:id/paid` and `PATCH /payments/:id/unpaid` (both `authorize('admin','trainer')`). `businessStatus` (PAID window / PENDING window / EXPIRING) is a **server compute**, not a stored field — exposed only through `GET /payments?businessStatus=`, not shown on the RN cards.

---

## 14. Mark Unpaid (and Mark Paid)

- Each card shows exactly **one** flip action, computed from current status:
  - `paid` → **"Mark Unpaid"**
  - `pending` → **"Mark Paid"**
- Tap → `Alert.alert('Confirm', 'Mark payment as unpaid?' | 'Mark payment as paid?', [Cancel, Confirm→])`.
- Confirm → `handleTogglePaymentStatus(item)`:
  - `markAsPaid(paymentId)` (PATCH `/payments/:id/paid`) or `markAsUnpaid(paymentId)` (PATCH `/payments/:id/unpaid`) from `api/payments`.
  - Server (`markAsPaid`): updates payment `status:'paid'`, clears the member's idempotency lock (`addToSet`-style untouched here), **updates member.paymentStatus to 'paid'**, and clears any pending-due `Notification`. `markAsUnpaid`: sets `status:'pending'` on payment **and** `member.paymentStatus='pending'`.
  - On success: **local state flips** that one card's `status`, temporary success text "✔ Marked as paid/unpaid" replaces the action link for ~1.6s.
- Gotchas:
  - The **KPIs are NOT refreshed** after a flip — stale until next period change/branch change/refresh (§6). The `Paid`/`Pending` counters will no longer match the list until then.
  - Approval detail: `markAsPaid` requires the payment be in `pending`; calling `paid` on a `paid` payment short-circuits with an "already paid" message (and vice-versa) — client already hides the wrong button, so this is an edge-case guard.

---

## 15. Invoice

- Tap **"Invoice →"** on a card → bottom-sheet Modal (`height: maxHeight 85%`, slide-up; `SafeAreaView` + `ScrollView`).
- Fetches `getInvoice(paymentId)` → `GET /payments/:id/invoice` (roles `admin`, `trainer`, and the owning `member` may call it).
- Modal shows `InvoiceContent`:
  - Brand header — **GYM_NAME "A1 FITNESS"** bold + "Fitness - {branchCode}" muted; invoice number + status badge.
  - "Billed To" — member name, membership/expiry dates.
  - Details block — Payment Date / Status / Payment Method / Plan / Start / Expiry / Operation Type.
  - Items table — single row: Plan name ×1, `formatINR(amount)`.
  - Total row — **"Total" `formatINR(amount)`** accent bold, grand total highlighted.
  - Note: `payment.note || ''`.
  - Footer — "Thank you for choosing A1 Fitness!" muted, with `Download Invoice` text row (accent) + `Close` button (grey).
- **Download behavior:** the RN client defines `downloadInvoicePDF(paymentId)` → `GET /payments/:id/pdf` returning a base64 data-URI via the api layer, **but the Payments screens never call it** — the "Download" row in the modal is present in the UI but not wired (no FileSystem/Share handler). This is a known gap to surface in React.js (§34).
- Server invoices JSON shape (used by modal): brand, invoiceNumber, member ({name,email,phone,branchCode}), amount, method, status, date, note, membershipStartDate, membershipExpiryDate, plan ({name, duration}).

---

## 16. Reminders

**Tab badge & reminder list (client-side):**
- `reminderItems = payments.filter(p => p.status === 'pending' || daysUntilExpiry(p.membershipExpiryDate) <= 7)` where `daysUntilExpiry = Math.ceil((expiry - Date.now())/86400000)`.
- Tab label shows `Reminders (${reminderItems.length})`; the list header shows **"Eligible Members (n)"** with subtitle **"Pending payments or plans expiring within 7 days"**.
- **Important:** this is a filter over the **loaded pages only** — with `page size 20` and a 2-page cap, the badge count may be **lower than the true server-side eligible set** (§34).
- ReminderCard = payment card variant: `Linking.openURL('https://wa.me/<phone>?text=...')` sends an encoded WhatsApp re-enrollment message; shows member avatar, name, invoice, plan, amount, expiry with days-left badge (red if ≤7). No pagination.

**Send Reminders (server-side):**
- `Send Reminders` button (§Admin/§SA both) → `Alert.alert('Send Reminders', 'Send renewal reminders to members whose plans expire soon in {branchCode}?', [Cancel, Send])`.
- Calls `sendReminders(branchCode?)` → **POST `/api/payments/reminders`** (`authorize('admin')` only — trainers can NOT trigger).
- Body: `{ memberIds }` optional, else bulk all eligible.
- Server eligibility (`reminder.service.computeEligibility`): member `status` in `active|pending` AND (**A**) `paymentStatus === 'pending'` OR (**B**) `status==='active' && currentPlan && expiry ∈ [today, today+REMINDER_WINDOW_DAYS(7)]`; excluded: cancelled/inactive/frozen/expired. `REMINDER_WINDOW_DAYS` env = 7.
- Branch: superadmin → `?branchCode=` (or `ALL`→all), else fixed to `req.user.branchCode || 'MAIN'`.
- Dispatch: creates **in-app `Notification`** records + **WhatsApp** via `whatsapp.service` (skip if disabled/not configured); dedupe per member+expiry+window; `MAX_SENDS_PER_REQUEST=100`, concurrency 3.
- Response → `ReminderSummary`: `{ eligible, inAppSent, whatsappSent, whatsappErrors?: { name, reason }[] }`; failures described via `describeWhatsappFailure`.
- UI result box (accent-border, title "Reminder result"): `${summary.eligible} member(s) due for renewal. ${summary.inAppSent} in-app reminder(s) sent.` (+ WhatsApp line when configured). Shows `⚠` red box for failed recipients.

---

## 17. Data Flow

```
[SuperAdmin Payments]
  focused → drawer.setActive('SuperadminPayments')
  │
  ├─ getBranches()                  GET /branches?limit=100   (once)
  │
  ├─ load('initial')
  │   ├─ getAnalyticsOverview(dateFrom,dateTo,branchCode?)
  │   │        GET /analytics/overview?dateFrom=..&dateTo=..[&branchCode=..]
  │   │        → kpis + breakdowns.paymentsByStatus   (KPI grid only)
  │   └─ fetchPayments()
  │           GET /payments?page=1[&limit=20]
  │              [+status=&method=&q=&dateFrom=&dateTo=&branchCode=]
  │           → PaymentPage { items, total }
  │
  ├─ spinner → render KPI grid + PaymentList (FlatList)
  │
  ├─ events:
  │   period/ branch-change → page=1 → load('refresh')
  │   search (debounce 500ms) → page=1 → fetchPayments()
  │   Load More / refresh ↻   → next page / page=1 (both calls)
  │   Mark Unpaid|Paid        → PATCH /payments/:id/… → local card flip
  │   Invoice →               → GET /payments/:id/invoice → sheet
  │   tab → Reminders(n)      → client filter of loaded payments
  │   Send Reminders          → POST /payments/reminders    (admin only)
  │
  └─ pagination: page starts 1, limit 20; hasMore = items.length < total;
                 "Load More" footer caps at 2 extra pages (page ≤ 3)

[BranchAdmin Payments]  (same, but)
  - no branch picker; branchCode = user.branchCode || 'MAIN'
  - Send Reminders scopes to own branch
```

Both screens initialise `branchCode = branch` that may already carry a value: SA uses drawer state; Admin uses `user.branchCode`.

---

## 18. API Contracts

Base: all `/api` prefixed by the RN client. Response envelope: `{ success, message, data }`.

**1. GET `/payments`** — `authorize('admin','trainer')`, `branchScope`.
Query: `page` (≥1), `limit` (≤100, default 20), `status`, `method`, `dateFrom`, `dateTo`, `q`, `branchCode`, `businessStatus`.
- `branchCode` for SA only; Admin locked to own branch (branchScope middleware overrides).
- `q` → buildSearchFilter (regex-i, or'd): `invoiceNumber`, `'member.name'` (via member user name), member phone, member email.
- Default sort `{ createdAt: -1 }` (newest first).
Response `data`: `PaymentPage { items: PaymentItem[], page, limit, total }`.
`PaymentItem`: `{ _id, invoiceNumber, amount, method, status, date, createdAt, plan{_id,name,price,duration}, member{ _id, user{_id,name,email,phone}, branchCode, membershipStartDate, membershipExpiryDate, status, paymentStatus }, operationType, branchCode, membershipStartDate, membershipExpiryDate, note }`.

**2. GET `/payments/dues`** — admin/trainer. `{ items: PaymentItem[] }` (pending dues). *(Not consumed by the Payments screens.)*

**3. GET `/payments/delivery-status`** — admin/trainer. *(Not consumed by these screens.)*

**4. GET `/analytics/overview`** — `authorize('admin','trainer')`, `branchScope`.
Query: `range|dateFrom|dateTo`, `planId`, `trainerId`, `branchCode`, `memberStatus`, `paymentStatus`, `paymentMethod`.
Response `data`: `{ kpis: { totalRevenue, totalTransactions, paidRevenue, pendingRevenue, pendingPaymentsCount, newMembers, activeMembers, inactiveMembers, renewalsCount, expiringCount, expiredCount, attendanceCount, avgRevenuePerTransaction }, series {...}, breakdowns: { revenueByMethod, revenueByStatus, revenueByPlan, membersByStatus, membersByPlan, attendanceByStatus, paymentsByStatus: [{_id:'paid'|'pending', count}] }, range, filters }`.

**5. POST `/payments/reminders`** — `authorize('admin')` **only** (trainers excluded).
Body `{ memberIds?: string[] }` (omitted = bulk). Query `branchCode` (SA; `ALL`/`all` = every branch). Response `data`: `ReminderSummary { eligible: number, inAppSent: number, whatsappSent: number, whatsappErrors?: { name, reason }[] }`.

**6. GET `/payments/:id/invoice`** — admin/trainer/owning-member. → `InvoiceData` JSON.

**7. GET `/payments/:id/pdf`** — admin/trainer/owning-member. → PDF (pdfkit), returns data-URI in RN client (`downloadInvoicePDF`, unused by screens).

**8. PATCH `/payments/:id/paid`** — admin/trainer. Body: none required. → updated `PaymentItem`.

**9. PATCH `/payments/:id/unpaid`** — admin/trainer. → updated `PaymentItem`.

**10. POST `/payments`** — admin/trainer. `createPayment` — body `{ memberId, planId?, amount, method, date?, status?, op? }┘term-key/idempotency dedupe via `{gymId, member, termKey}` sparse unique. *(Not reachable from the Payments screens; it is the member-assignment create flow.)*

**11. POST `/payments/online/intent` | `/payments/online/confirm`** — stubbed (501) in the current backend; UI has no online flow.

Underlying branch scope: `branchScope` middleware forces non-superadmin queries to `branchCode = req.user.branchCode || 'MAIN'` regardless of body/query.

---

## 19. Payment Data Model

`payment.model.js` (mongoose):

| Field | Type | Notes |
|---|---|---|
| `gymId` | ObjectId (ref Gym) | required, indexed |
| `member` | ObjectId (ref Member) | required, indexed |
| `plan` | ObjectId (ref Plan) | required, indexed |
| `amount` | Number | required, min 0 |
| `date` | Date | default now, required |
| `method` | enum `cash\|card\|upi\|online` | default `cash` |
| `status` | enum **`paid\|pending`** | default `paid` |
| `note` | String | |
| `invoiceNumber` | String | required, **unique index** `{gymId, invoiceNumber}` |
| `invoice` | Object (default `{}`) | server-generated invoice JSON |
| `dueDate` | Date | |
| `membershipStartDate` | Date | immutable historical snapshot |
| `membershipExpiryDate` | Date | immutable snapshot |
| `operationType` | enum `assign\|renew\|upgrade` | |
| `termKey` | String | dedupe key |
| `idempotencyKey` | String | |
| `branchCode` | String | default `"MAIN"`, indexed |
| timestamps | | `createdAt` (sort key) |

_Note: a sparse unique index on `{gymId, termKey...}` exists (truncated in read) — used for idempotent plan-term creation; `inspect-payments.js` confirms field surface._

Business status buckets (`paymentStatusFilter.service.js`): `PAID_WINDOW_DAYS=20 / PAID_MIN_DAYS=15` → `paid`; `PENDING_WINDOW_DAYS=30` → `pending`; expiring portion based on the SAME member-date window → `expiring`. These are **computed** (not stored) and used by `GET /payments?businessStatus=`.

---

## 20. Pagination & List Behavior

- **Payments list** = `FlatList`:
  - `page` starts at 1, `limit` = 20 (fixed, not user-facing).
  - Server returns `total`; client computes `hasMore = items.length < total`.
  - **No `onEndReached`/scroll-based loading.** A **ListFooter** renders:
    - if `hasMore` and `page < 3` → a **"Load More"** button (plain, accent border, accent text, spinner while `loading==='refresh'`); tap → `page+1` → fetch → append `...prevItems, ...newItems`.
    - else → centered muted **"End of list"**.
  - So the RN app caps at 3 pages (60 records) — a deliberate simplification; server supports pagination without cap.
- Search/period/branch change resets `page = 1` (list replaced, not appended).
- Refresh (`load('refresh')`) keeps the current list while refetching page 1, then replaces.
- `key` uses `item._id`; memoized `renderItem` via `React.memo`.

---

## 21. Loading States

| State | Render |
|---|---|
| First load (initial) | Header + filter row visible; content area full-screen `ActivityIndicator` (accent) + muted `"Loading payments..."` |
| Refresh (pull / button / period change) | Existing list stays; `RefreshControl` spinner (accent) OR Load More spinner; no overlay |
| Invoice modal open | Modal spinner `"Loading invoice..."` (accent) |
| Send Reminders in-flight | Button label → `Sending...` + disabled, small spinner |
| New branch/period applied | same as refresh (page reset visually after fetch replaces) |

All spinners use `colors.accent` (#8b5cf6).

---

## 22. Empty States

| Context | Icon | Copy |
|---|---|---|
| Payments list empty | ₹ (accent, centered, 32) | **"No payments found for this period."** (text centered, muted) |
| Reminders tab empty | ✓ (success green) | **"No members need reminders right now."** + "All caught up. Reminders appear automatically when members have pending payments or plans expiring within 7 days." |
| Branch picker list empty | — | (no explicit empty state; blank area) |

Empty Payments uses a `ListEmptyComponent` inside the FlatList (KPI header still above).

---

## 23. Error States

- **First-load failure** (`error && analytics == null`): centered ⚠ (red) + error text + **Retry** button (accent) → `load('refresh')`.
- **Refresh failure after data present:** **silently swallowed** — `error` state set but the error UI requires `analytics == null` to render, and no toast/banner is shown. The stale list remains. *(Known gap to fix in React.js.)*
- **Status-flip failure:** `Alert.alert('Error', ...)` with server message.
- **Invoice fetch failure:** `Alert.alert('Error', 'Failed to load invoice.')` and the modal closes on dismiss.
- **sendReminders failure:** `Alert.alert('Error', summary)`, or WhatsApp errors surfaced inside the result box (`⚠` red border + per-recipient reason).
- Client `api.request` rejects non-2xx with `{ message }`; screen error messages are server-authored where available.

---

## 24. Role-Based Behavior

| Feature | Super Admin | Branch Admin | Trainer |
|---|---|---|---|
| Access screen | `SuperadminPayments` (drawer) | `AdminPayments` (drawer) | **No payments screen** |
| Branch scope | Selectable — "All Branches" or one branch via picker | Locked to `user.branchCode \|\| 'MAIN'` | n/a (no screen) |
| Branch column on cards | **yes** | no (own branch) | n/a |
| Refresh | header pill | header pill | n/a |
| Mark Paid / Unpaid | yes | yes | via API, no UI |
| Invoice (view) | yes | yes | API-only |
| Send Reminders | yes, scoped to selected branch | yes, own branch | **no** (`authorize('admin')`) |
| Wrong-branch enforcement | server `branchScope` (SA bypass) | server forces own branch | — |

Every backend payment route is `authorize('admin','trainer')` (plus member routes `GET /my-payments` for members). Trainer **can** hit the payment APIs (list, dues, flip, invoice/pdf, delivery-status) but has **no UI route** — role behavior gap.

---

## 25. Branch-Based Behavior

- **Super Admin "All Branches":** analytics overview and list are gym-wide; `paymentsPipeline` runs without the member `$lookup`, so amounts/counts are summed across branches; `Expiring` reflects all memberships gym-wide.
- **Super Admin single branch:** adds `branchCode` filter; both `GET /payments` and `GET /analytics/overview` join `members` and match `_member.branchCode` (list) / `members.branchCode` (analytics member counts). Payments whose `member` was since moved to another branch follow the **member's current branch**.
- **Branch Admin:** same as SA-single-branch but permanently fixed.
- Branch state for SA is **not persisted** to SecureStore (unlike dashboard's `saveBranch`) — it resets to the drawer-saved default on screen focus.
- Premium branch-awareness: `PlanBranch` gating affects which plans a branch can use; analytics `getFilterOptions` also applies `PlanBranch` for non-SA filter options (not applied on the Payments screen itself).

---

## 26. Navigation

- Drawer items (`SuperadminDrawer` line 43 / `AdminDrawer` line 33):
  `{ key: 'Payments', label: 'Payments & Reminders', icon: '₹', route: 'SuperadminPayments' | 'AdminPayments', enabled: true }`.
- Registered in the stack/drawer via `src/navigation/index.tsx` + typed routes in `src/navigation/types.ts` (both `SuperadminPayments` and `AdminPayments` confirmed registered).
- From Payments there is **no** onward navigation: no member-details link, no invoice-as-screen, no branch screen. All detail (invoice) is a modal; everything else is internal state.

---

## 27. Permissions

- Route-level backend: **`protect`** (JWT) on all `/api/payments/**`; `branchScope` ensures per-branch data isolation for non-superadmins; `authorize('admin','trainer')` on the admin endpoints; `authorize('admin')` on `POST /reminders`; members may `GET /my-payments` and their own `/:id/invoice` + `/:id/pdf`.
- The **frontend does not enforce permissions** — it renders buttons for the API calls available to the signed-in role. A `trainer` given the drawer item would see broken Send Reminders; the UI simply isn't wired for them.
- No client-side caching/offline; all data is network-fresh per screen visit.

---

## 28. Responsive Behavior

- The RN app is mobile-first; screens use `SafeAreaView` + `ScrollView`/`FlatList` only — no tablet breakpoints, no multi-column layouts. React.js port must decide breakpoints; RN-context clues:
  - KPI grid is 2×2 (flexWrap, 48% width each).
  - Payment card is single column; `InfoRow` = label left, value right (single line, truncate).
  - Filter row is a single horizontal row: period pill + stretch search input (flex:1) — will overflow on narrow screens unless wrapped.
  - Modals (period `60%`, branch `80%`, invoice `maxHeight 85%`) slide from bottom and scroll internally.
- React.js recommendation: keep single-column ≤768px, allow the same cards to breathe on desktop without inventing a new layout.

---

## 29. Visual Design Specification

**Palette (theme `colors.ts`):** background `#0A0B10`, surface `#151A20`, surface alt `#1A222B`, border `#20262C`, inputBackground `#14181E`, primary `#E11D2E`, accent `#8b5cf6`, success `#2EB872`, danger `#E5484D`, text `#FFFFFF`, textMuted `#9AA7B4`, textFaint `#6B7785`, amber `#f59e0b`, header bg `#0D1117`.

**Typography:** Titles 22/800; card headers 15/700; labels 13/600 muted; values 14/600; small 12 muted; KPI value 22/800; monospace invoice# 12/700; badges 11/700 uppercase.

**Spacing/radius:** padding(page) 16; card padding 14; card radius 12; marginBottom card 12; gap rows 10; pill radius 999; button radius 10.

**Header:** title+subtitle left-aligned; right slot holds pill/actions. Subtitle 13 muted.

**KPI cards:** 48% width, surface bg, radius 12, padding 14, value right? No — **value under accent-colored label**; values colored per §10 (accent/success/amber/primary).

**Interactions:** taps = instant color shift to accent; secondary text-buttons white→accent on press; spinners accent; Alert confirm dialogs native.

**Icons:** emoji/unicode only — `₹` icon, `↻`, `👤`, `🔍`, `→`, `⚠`, `✓`, `▾`. No icon library. (React.js may keep these exact unicode glyphs for parity.)

---

## 30. Component Inventory

| React Native Component | File | Responsibility | Props | State |
|---|---|---|---|---|
| `SuperadminPaymentsScreen` | `SuperadminPaymentsScreen.tsx` | Full dashboard (SA) | `navigation` | branches, branchCode/Name, mode, period, search, payments[], analytics, page, loading, error, reminderResult |
| `AdminPaymentsScreen` | `AdminPaymentsScreen.tsx` | Full dashboard (Admin) | `navigation` | same minus branches/branchCode |
| `PaymentList` | both (local) | FlatList of cards | items, trigger, loadMore, refresh, title, subtitle?, hasMore, empty | — |
| `PaymentCard` | both (local, memo) | Single payment row | item, onToggle, onInvoice, extraLoading | flipText timeout |
| `ReminderList` | both (local) | Filtered reminders list | items, sendReminders, reminderLoading, title | — |
| `KpiCard` | both (local) | ₹/Paid/Pending/Expiring tile | label, value, color | — |
| `InfoRow` | both (local) | Label/value row | label, value, color? | — |
| `InvoiceContent` | both (local) | Invoice sheet body | invoice | — |
| `StatusBadge` | `src/components/StatusBadge.tsx` | Status pill (shared) | `status` | — |
| `SuperadminHeader` | `src/components/SuperadminHeader.tsx` | Chrome (shared) | title, subtitle, rightSlot, onMenu | — |
| Drawer | `src/components/drawer/*` | Nav rail | active, onSelect | activeKey |
| `PaymentItem` | `src/api/payments.ts` | Type + fetch helpers | — | — |

_No navigation to other screens; only vanity modal previews. The two screen files duplicate ~95% of JSX logic — the React.js port should extract the shared `PaymentsDashboard` once._

---

## 31. Screenshot-to-Code Verification

No screenshot image file exists in the workspace (only `assets/*.png` app icons). The itemized description from the request was cross-checked against source — text described to match where code confirms:

| Screenshot claim | Source verdict |
|---|---|
| Header "Payments / All Branches" with hamburger + ↻ | ✅ Title `Payments`, SA subtitle = selected branch name (`All Branches` default), right-slot refresh |
| Branch pill "All Branches ▾" + refresh | ✅ header-right pill = branch name + `▾`, opens branch modal |
| Tabs "Payments \| Reminders (1)" | ✅ segmented toggle; badge = client filter count |
| Period "This Month ▾" | ✅ PERIODS `Today/This Month/This Year`, default This Month |
| Search "Search invoices..." | ✅ placeholder matches |
| Cards total `₹4,054`, paid 2, pending 0, expiring 1 | ✅ consistent with server KPI derivation (money sum / status counts / 14-day expiry window) |
| "Payment Records (2)" header | ✅ `Payment Records ({total})` |
| Two cards invoice#/plan/amount/date/branch/method/start/expiry/type | ✅ card fields match the model (`INV-…`, `Test`, `UPI`, `19 Sept'26`) |
| "End of list" footer | ✅ rendered when `!hasMore` |
| Mark Unpaid / Invoice buttons | ✅ both confirmed wired |
| Visual skin (dark, red accents, ₹) | ✅ palette matches theme file |

**Not confirmed in the available source:** actual pixel layout/spacing of the screenshot, background gradient, card shadow depth. The screenshot must be supplied for exact pixel parity.

---

## 32. React.js Component Mapping

| RN component → React.js | Purpose |
|---|---|
| `SuperadminPaymentsScreen` → `SuperadminPaymentsPage` | Page orchestrator (SA) |
| `AdminPaymentsScreen` → `AdminPaymentsPage` | Page orchestrator (Admin) |
| shared → `PaymentsDashboard` (extracted) | KPI + tabs + filters + list + reminders + modals, `role`/`branchScope` + `initialBranchCode` props |
| `PaymentList` → `<PaymentList />` (list) | Table/cards grid + "Payment Records (n)" + Load More/End-of-list footer |
| `PaymentCard` → `<PaymentCard />` | Row card (fields per §11) |
| `ReminderList` → `<ReminderList />` | Reminder rows + Send Reminders bar + result box |
| `KpiCard` → `<KpiCard />` | 4 stat tiles |
| `StatusBadge` → `<StatusBadge />` | status pill (map: loaded via `resolveColor`) |
| `SuperadminHeader` → `PageHeader` | title/subtitle/actions (adapt hamburger → sidebar toggle) |
| Modals → `<PeriodPicker/>, <BranchPicker/>, <InvoiceModal/>` | bottom-sheet equivalents (maybe `dialog`) |
| DrawerContext → `useDrawer` | nav active-state (→ router `activeNav`) |

---

## 33. React.js Dummy Data Requirements

Only confirmed fields — mirror `PaymentItem`/`PaymentPage` exactly:

```
{
  paymentsByStatus: [{ _id: 'paid', count: 2 }, { _id: 'pending', count: 0 }],
  kpis: { totalRevenue: 4054, expiringCount: 1, paidRevenue: 4054, pendingRevenue: 0,
          totalTransactions: 2, pendingPaymentsCount: 0, newMembers: 0, activeMembers: 0,
          inactiveMembers: 0, renewalsCount: 0, expiredCount: 0, attendanceCount: 0 },
  payments: [{
    _id: 'p1', invoiceNumber: 'INV-178947-...', amount: 3999, method: 'upi', status: 'paid',
    date: '2026-09-18T10:00:00.000Z', createdAt: '2026-09-18T10:00:00.000Z',
    operationType: 'assign', branchCode: 'MAIN',
    membershipStartDate: '2026-09-18T00:00:00.000Z', membershipExpiryDate: '2026-09-20T00:00:00.000Z',
    plan: { _id: 'pl1', name: 'Test', price: 3999, duration: 3 },
    member: { _id: 'm1', user: { _id: 'u1', name: 'Test', email: '', phone: '9000000001' },
              branchCode: 'MAIN', membershipStartDate: '2026-09-18T00:00:00.000Z',
              membershipExpiryDate: '2026-09-20T00:00:00.000Z', status: 'active', paymentStatus: 'paid' }
  }, {
    _id: 'p2', invoiceNumber: 'INV-178947-...', amount: 355, method: 'card', status: 'paid',
    date: '2026-09-15T09:00:00.000Z', createdAt: '2026-09-15T09:00:00.000Z',
    operationType: 'assign', branchCode: 'BR-2',
    membershipStartDate: '2026-09-15T00:00:00.000Z', membershipExpiryDate: '2026-09-18T00:00:00.000Z',
    plan: { _id: 'pl2', name: 'Test', price: 355, duration: 3 },
    member: { _id: 'm2', user: { _id: 'u2', name: 'Test', email: '', phone: '9000000002' },
              branchCode: 'BR-2', membershipStartDate: '2026-09-15T00:00:00.000Z',
              membershipExpiryDate: '2026-09-18T00:00:00.000Z', status: 'active', paymentStatus: 'paid' }
  }],
  total: 2, page: 1, limit: 20,
  branches: [{ _id: 'b1', branchCode: 'MAIN', name: 'Main Branch' },
             { _id: 'b2', branchCode: 'BR-2', name: 'Branch 2' }],
  sending: { eligible: 1, inAppSent: 1, whatsappSent: 0 },
}
```

Use `total > items.length` to prove the Load More → "End of list" transition; one `pending`-status payment to prove the amber `StatusBadge` + `Mark Paid` button; one expiry ≤7 days to show the red expiry highlight.

---

## 34. Known Gaps / Unknowns

Confirmed in source:

1. **KPI/Reminder badge drift** — after a status flip the KPI grid is not refreshed; the Reminder `(n)` badge counts only **loaded** pages (max 60 records) and can undercount the server's real eligible set.
2. **Refresh error silent-swallow** — after first success, refresh failures leave the stale list with no warning.
3. **Download Invoice not wired** — modal shows "Download Invoice" but calls nothing; `GET /:id/pdf` exists server-side and `downloadInvoicePDF()` client-side, both unused.
4. **`paid` badge colour** — `resolveColor` has no `paid` branch → rendered **grey** (`textMuted`), which may not match the original product intent (screenshot shows a light band; exact hex unverifiable without the image).
5. **Online payments stubbed** — `/online/intent` + `/online/confirm` return 501; there is no online flow anywhere in the RN UI.
6. **Trainer has no Payments UI** despite `authorize('admin','trainer')` on the API.
7. **No member avatar image** — only initials; no remote profile pictures.
8. **No screenshot asset in repo** for this screen (pixel parity pending).
9. **Pagination cap** — RN app never loads beyond 3 pages even though the API supports more.
10. **`createPayment` (POST /payments)** is not reachable from the Payments screens — assignments come from the member flow; the React.js Payments page must not reinvent creation unless required.

Unknowns / not applicable to decide in the audit; flag for the build: mobile-only layout metrics, exact font stack for web, toast/banner behaviour for silent errors.

---

## 35. React.js Implementation Checklist

- [ ] Extract one shared `PaymentsDashboard` driven by `role` (`superadmin|admin`) + `branchScope`.
- [ ] Header with hamburger→sidebar toggle, title `Payments`, subtitle = branch name (SA) / branch code (Admin), right pill + refresh.
- [ ] SA-only branch picker modal (search + list + ✓), ALL default; Admin fixed branch.
- [ ] Segmented Payments / `Reminders (n)` toggle; reminder tab = client filter (`status==='pending'` OR `daysUntilExpiry<=7`).
- [ ] Period pill (Today / This Month / This Year → `dateFrom`/`dateTo`) + debounced "Search invoices..." (500ms → `q`).
- [ ] KPI 2×2 grid: Total = `kpis.totalRevenue` (₹ en-IN), Paid = `paymentsByStatus['paid'].count`, Pending = `['pending'].count`, Expiring = `kpis.expiringCount`.
- [ ] Payment card: avatar initials, `StatusBadge` (`paid`→grey, `pending`→amber via resolver), invoice number + `Invoice →` open sheet, plan/amount/date/branch(SA)/method/start/expiry/type.
- [ ] Mark Paid / Mark Unpaid with confirm `Alert` → PATCH `/payments/:id/paid|unpaid` → local flip + "✔" flash **(decision: refetch KPIs to avoid drift)**.
- [ ] InvoiceBottomSheet: client `GET /payments/:id/invoice`; brand header, billed-to, details, items, total, note, footer. **(decision: wire the PDF download btn to `/payments/:id/pdf`).**
- [ ] Payments FlatList-equivalent: page 1, limit 20, Load More (≤ page 3) / "End of list", RefreshControl.
- [ ] Send Reminders (Admin only): confirm → `POST /payments/reminders` (branch scoped) → result box with eligible/in-app/WhatsApp + error rows.
- [ ] Loading (initial spinner / refresh retains list), Empty (₹ + "No payments found for this period." / ✓ "No members need reminders right now."), Error (full retry on first load + **surface a banner for refresh errors**).
- [ ] Dark theme parity (`#0A0B10/#151A20/#E11D2E/#8b5cf6/...`), unicode icons, en-IN `₹` formatting.
- [ ] Permission map: Payments page → superadmin+admin only; render, disable or hide Send Reminders for trainer.

---

## 36. Definition of Done

- [ ] React.js Payments page renders with the dummy data set (§33) matching the described screenshot (pending the actual image for pixel parity).
- [ ] SA vs Admin differences verified: branch picker (SA), fixed own-branch (Admin), branch column on cards (SA only).
- [ ] All four KPI cards derive from the correct fields and update on `dateFrom/dateTo/branchCode` change.
- [ ] Payments list paginates (Load More until "End of list"); search + period filter refetch page 1.
- [ ] Mark Paid/Unpaid flips status locally, refreshes (or queues) KPI totals, handles error with Alert.
- [ ] Invoice sheet opens with correct rendered data; PDF button wired.
- [ ] Reminders tab filter + badge correct; Send Reminders (admin) shows result metrics and error rows; disabled for trainer role.
- [ ] Loading / Empty / Error states implemented per §21–23 (including the refresh-error banner fix).
- [ ] All copy, ₹ formatting, and colour tokens match the RN source of truth.
- [ ] Screenshot supplied → pixel-inspect each section and close out any §31 "Not confirmed" items.

---

_Audit complete. No files were modified. RN source remains the single source of truth; all API field names above were read directly from code._