# A1 FITNESS — MEMBERS SECTION
# REACT NATIVE INVESTIGATION & AUDIT

> Investigation-only audit of the **Members** feature in the A1 Fitness React Native app.
> Covers both **Super Admin** (`role === 'superadmin'`) and **Branch Admin** (`role === 'admin'`).
> Purpose: a complete source-of-truth document so the Members section can be rebuilt in a fresh React.js frontend without re-reading the React Native codebase.
>
> **No implementation was performed. No code was modified.** Every claim below is backed by `src/` / `server/` source references. Anything not verified is explicitly marked `Not verified / not found in inspected source`.

---

## 1. EXECUTIVE SUMMARY

The Members feature is split by role into **two screens with nearly identical UI** that differ only in scope:

- **Super Admin** (`SuperadminMembersScreen`) — sees members of **all branches**, has **two filter chips** (Status + Branch, branch default `ALL`), shows the member's **Branch** row on the card, opens the shared `MemberDetails` screen, and passes **no branch scope** to the shared modals (all plans/trainers visible). New-member form **requires a password**.
- **Branch Admin** (`AdminMembersScreen`) — sees **only members of their own branch** (branch from the authenticated `user.branchCode`), has **only the Status filter chip** (no branch filter), the member card has **no Branch row**, opens `AdminMemberDetails`, and passes its own `branchCode` into the shared modals (plans/trainers scoped to branch; only their own branch selectable). New-member form does **not** require a password.

The reusable pieces are `SuperadminHeader`, `StatusBadge`, `MemberFormModal`, and `MemberSubscriptionModal`. The list screens themselves duplicate their local helpers (`MemberCard`, `PaymentBadge`, `FilterChip`, `ChoiceSheet`, formatters) rather than sharing a component.

The backend is present in this workspace and was used as the authoritative source for permissions, branch scoping, search, statuses, membership/payment atomicity, and delete cascading (`server/`). Backend confirms:

- **Branch scoping is enforced server-side** (`branchScope` middleware + `enforceBranchOwnership`): non-superadmins are forced to `user.branchCode` on every members query and write.
- **Permissions** are role-based strings: admins hold `create_member`, `view_member`, `update_member`, `delete_member`, `approve_member`, `manage_plans`; superadmin bypasses every permission check.
- **Member statuses**: `pending | active | expired | frozen | cancelled | inactive`. **Payment status**: `paid | pending` (both also shown as badges in the UI).
- **Assign/Renew/Upgrade** create the Payment record **atomically** in a MongoDB transaction with idempotency (`termKey` + optional client `idempotencyKey`).
- **Delete is permanent** and cascades to `User`, `Payment`, `Attendance`, `Progress`, `Notification`, `WorkoutPlan`, `DietPlan`.
- **Open unknowns** (see §34): `upgradePlan`, `freezePlan`, `resumePlan`, and `searchMembers` exist server-side but are **not reachable from the RN members UI** (no buttons/API calls found). The supplied screenshot asset is **not present in the workspace**; the screenshot comparison in §29 is against the prompt's textual description only.

Cross-cutting fact for the React.js rebuild: **membership changes are payment events** — assign/renew (and upgrade, if exposed) record revenue atomically in one request, and the client passes payment fields (`amount`, `method`, `status`, optional `note`, `idempotencyKey`) inside `body.payment`.

---

## 2. INVESTIGATION SCOPE

- **In scope:** all Members functionality for Super Admin and Branch Admin: list, search, filters, member cards, add/edit forms, subscription (assign/renew/cancel), approve, activate/deactivate, delete, details, navigation, API layer, backend authorization / branch-scoping / validation, loading / empty / error states.
- **Out of scope:** member-facing app flows, Trainer role UI, and the Payments / Attendance / Plans / Scanners modules except where they intersect with Members (plan pickers, payment fields, trainer picker).
- **Method:** static source inspection of the RN app (`src/`) and the in-workspace backend (`server/`). No runtime execution and no screenshot asset were available.

---

## 3. FILES INVESTIGATED

### React Native app (`src/`)
| File | Purpose |
|---|---|
| `src/screens/SuperadminMembersScreen.tsx` | Super Admin members list (864 lines) |
| `src/screens/AdminMembersScreen.tsx` | Branch Admin members list (826 lines) |
| `src/screens/MemberDetailsScreen.tsx` | Member details — used by Super Admin (604 lines) |
| `src/screens/AdminMemberDetailsScreen.tsx` | Member details — used by Branch Admin (597 lines) |
| `src/components/member/MemberFormModal.tsx` | Shared Add/Edit member modal (670 lines) |
| `src/components/member/MemberSubscriptionModal.tsx` | Shared Assign/Renew/Cancel modal (546 lines) |
| `src/api/members.ts` | Members API client + types + `showSubscriptionAction` |
| `src/api/idempotency.ts` | RFC4122 v4 UUID generation |
| `src/api/branches.ts` | `BranchItem`, `getBranches` |
| `src/api/plans.ts` | `PlanItem`, plan operations |
| `src/api/client.ts` | Fetch wrapper, `ApiError`, 401 refresh flow |
| `src/navigation/index.tsx`, `src/navigation/types.ts` | Role-gated stacks, route params |
| `src/components/StatusBadge.tsx` | Status pill color/logic |
| `src/components/SuperadminHeader.tsx` | Shared page header |
| `src/components/drawer/DrawerContext.tsx`, `AdminDrawer.tsx`, `SuperadminDrawer.tsx` | Drawer + Members entries per role |
| `src/auth/AuthContext.tsx`, `src/auth/types.ts` | `user.role`, `user.branchCode`, session |
| `src/theme/colors.ts` | Design tokens |

### Backend (`server/`) — used as API-contract source
| File | Purpose |
|---|---|
| `server/routes/member.routes.js` | Member endpoints + permission guards |
| `server/controllers/member.controller.js` | List/get/create/update/delete/approve + membership/payment ops |
| `server/models/member.model.js` | Member schema (statuses, biometrics, branchCode, expiry) |
| `server/models/user.model.js` | User schema (role, branchCode, email uniqueness) |
| `server/middlewares/branchScope.middleware.js` | Branch scoping rules |
| `server/middlewares/auth.middleware.js` | JWT `protect` + `authorize()` role→permission map |
| `server/controllers/branch.controller.js` | Branch list scoping (non-superadmin sees own branch only) |
| `server/routes/trainer.routes.js` | Trainers endpoint (admin-level) |
| `server/utils/membership.js` | Member eligibility / blocked statuses |

---

## 4. MEMBERS SCREEN INVENTORY

| Screen/Component | File | Route | Purpose | Roles | Entry | API calls |
|---|---|---|---|---|---|---|
| Superadmin members list | `SuperadminMembersScreen.tsx` | `SuperadminMembers` | List/filter all-branch members | superadmin | Drawer Members `▤` | `getBranches`, `getMembers`, `approveMember`, `updateMember`, `deleteMember` |
| Branch Admin members list | `AdminMembersScreen.tsx` | `AdminMembers` | List/filter own-branch members | admin | Drawer Members `▤` | same, `getMembers(… branchCode=own)` |
| Member details (SA) | `MemberDetailsScreen.tsx` | `MemberDetails {memberId}` | Full record view | superadmin | Card `Details` | `getMember`, `getBranches`, approve/update/delete + modal APIs |
| Member details (Admin) | `AdminMemberDetailsScreen.tsx` | `AdminMemberDetails {memberId}` | Full record view, own-branch scoped | admin | Card `Details` | same |
| Add/Edit member modal | `MemberFormModal.tsx` | — (Modal) | Create or update member | both | `+ Add Member` / `Edit` | `getPlans`, `getTrainers`, `createMember`, `updateMember` |
| Subscription modal | `MemberSubscriptionModal.tsx` | — (Modal) | Assign/Renew/Cancel plan + payment | both | Card `Subscription` / details `Manage Subscription` | `getPlans`, `assignPlan`, `renewPlan`, `cancelPlan` |
| Status filter bottom sheet | `ChoiceSheet` (in both list screens) | — (Modal) | Status picker | both | All Statuses chip | none |
| Branch filter bottom sheet | `ChoiceSheet` (Superadmin only) | — (Modal) | Branch picker | superadmin only | All Branches chip | none |
| Approve confirm | `Alert.alert` | — | Approve pending | both | Card `Approve` / details banner | `approveMember` |
| Activate/Deactivate confirm | `Alert.alert` | — | Toggle status | both | Card / details button | `updateMember` |
| Delete confirm | `Alert.alert` | — | Permanent delete | both | Card `Delete` / details button | `deleteMember` |

No separate search-results screen, no pagination UI, no trainer-scoped screen exists. Search and filters live entirely on the two list screens. `MemberDetails` vs `AdminMemberDetails` are separate routes/screens (not one screen reused).

## 5. SUPER ADMIN INVESTIGATION

Verified from `SuperadminMembersScreen.tsx` + backend.

**Member visibility**
- Sees members from **all branches**: no `branchCode` is sent when `branchFilter === 'ALL'` (default). `source: SuperadminMembersScreen.tsx:119-124`; `src/api/members.ts:170-182`.
- Sees **all statuses**. Status options: `All Statuses, Active, Pending Approval, Expired, Frozen, Cancelled, Inactive`. `source: SuperadminMembersScreen.tsx:61-69`.

**Branch access**
- `getBranches()` loads all branches for the branch filter chip. `source: SuperadminMembersScreen.tsx:117`.
- Branch chip defaults to **All Branches** (`branchFilter` initial `'ALL'`). `source: SuperadminMembersScreen.tsx:92`.
- Branch picker labels each option `name (branchCode)`. `source: SuperadminMembersScreen.tsx:387-394`.
- Selecting a branch sends `branchCode`; `ALL`/empty is dropped server-side too. `source: member.controller.js:458-460`.
- **Branch shown on card**: superadmin card renders `Branch` row `branchLabel (branchCode)`. `source: SuperadminMembersScreen.tsx:491-496`.

**Actions (all verified)**
- **Add Member** — yes: header `+ Add Member` → `MemberFormModal` (all branches; `requirePassword` default **true**). `source: SuperadminMembersScreen.tsx:152-155, 271-275, 402-408`.
- **View Member Details** — yes → `MemberDetails` route. `source: SuperadminMembersScreen.tsx:170-175`.
- **Edit Member** — yes: card `Edit` → same modal in edit mode.
- **Change Branch** — yes via edit form (superadmin-only branch field; backend accepts `branchCode` only for superadmin). `source: MemberFormModal.tsx:236`; `member.controller.js:633-636`.
- **Assign Trainer** — yes via form Trainer chips (`getTrainers(branchCode)`). `source: MemberFormModal.tsx:437-476`.
- **Change Plan** — via **Subscription** modal (Assign/Renew). The edit form has **no plan field**. `source: MemberSubscriptionModal.tsx:114-166`.
- **Manage Subscription** — yes: card `Subscription` (hidden for pending) + details `Manage Subscription`. `source: SuperadminMembersScreen.tsx:530-538`.
- **Activate / Deactivate** — yes: card 2<sup>nd</sup> row (`Deactivate`↔`Activate`) → `updateMember({ status })`. `source: SuperadminMembersScreen.tsx:211-236`.
- **Approve** — yes for `pending` (card `Approve`, details banner) → `approveMember`. `source: SuperadminMembersScreen.tsx:190-209`.
- **Delete Member** — yes (card + details), permanent. `source: SuperadminMembersScreen.tsx:238-262`.

Subscription modal for Super Admin opens with **no** `branchCode` → `getPlans()` returns all plans. Backend still validates plan↔branch availability unless caller is superadmin. `source: SuperadminMembersScreen.tsx:410-415`; `member.controller.js:72-87`.

---

## 6. BRANCH ADMIN INVESTIGATION

Verified from `AdminMembersScreen.tsx`, `AdminMemberDetailsScreen.tsx` + backend.

**Member visibility**
- Sees **only own-branch members**: branch = `user?.branchCode ?? ''` from `useAuth()`; passed to `getMembers`. `source: AdminMembersScreen.tsx:76-79, 118-126`.
- Server double-enforces: `branchScope` overwrites `req.query.branchCode` with the user's branch; list filter forces `branchFilter.branchCode`. `source: branchScope.middleware.js:22-27`; `member.controller.js:456-458`.
- Same status filter options as Super Admin. `source: AdminMembersScreen.tsx:62-70`.

**Branch restrictions**
- Branch comes from the **authenticated user only**. No branch selector exists.
- **No branch filter chip** — only `filterSheet === 'status'`. `source: AdminMembersScreen.tsx:96, 281-286`.
- `getBranches()` is still called, but only to resolve **their own branch** for form chips (`branches.find(...)`) — server already returns only the user's branch for non-superadmins. `source: AdminMembersScreen.tsx:127`; `branch.controller.js:12-20`.
- **Cannot change branch**: form `branches=[adminBranch]` (own only) and backend ignores `branchCode` for non-superadmin. `source: AdminMembersScreen.tsx:373`; `member.controller.js:633-636`.

**Actions (verified)**
- **Add Member** — yes; **password NOT required** (`requirePassword={false}`). `source: AdminMembersScreen.tsx:369-377`.
- **View Details** — yes → `AdminMemberDetails`. `source: AdminMembersScreen.tsx:161-166`.
- **Edit** — yes (modal, own-branch list only).
- **Manage Subscription / Change Plan** — yes, **branch-scoped**: `branchCode` passed → `getPlans(branchCode)`; backend also enforces plan applied to the branch. `source: AdminMembersScreen.tsx:379-385`; `member.controller.js:72-87`.
- **Assign Trainer** — yes; trainers loaded for own branch. `source: MemberFormModal.tsx:131-142`.
- **Approve / Activate / Deactivate / Delete** — identical handlers to Super Admin. `source: AdminMembersScreen.tsx:181-253`.

**Differences vs Super Admin (summary)**: no branch filter, no Branch row on card, own-branch scoped modals, password not required on create, separate `AdminMemberDetails` route, subtitle "Manage members in your branch." vs "Manage memberships across all branches."

---

## 7. ROLE & PERMISSION MATRIX

Each row is the **verified** capability in the RN UI + backend.

| Capability | Super Admin | Branch Admin | Evidence |
|---|---|---|---|
| View members | Yes | Yes | `SuperadminMembersScreen.tsx:119-124`, `AdminMembersScreen.tsx:118-126` |
| View all branches' members | Yes | No (own branch only) | server forces branch; `branchScope.middleware.js:22-27`, `member.controller.js:456-458` |
| Search members | Yes | Yes | `src/api/members.ts:184-200` (server regex, §12) |
| Status filter | Yes | Yes | `STATUS_OPTIONS` in both list screens; `member.controller.js:463-465` |
| Branch filter | Yes (default ALL) | No | `SuperadminMembersScreen.tsx:295-298`; not present in `AdminMembersScreen.tsx` |
| Add member | Yes | Yes | forms in both screens |
| Create with password | Yes (required) | No (not required) | `MemberFormModal.tsx:116,208-210`; `AdminMembersScreen.tsx:376` |
| View details | Yes | Yes | `MemberDetails`, `AdminMemberDetails` |
| Edit member | Yes | Yes | `MemberFormModal` in edit mode |
| Change branch | Yes (edit form) | No | `member.controller.js:633-636`; admin form branches `[adminBranch]` |
| Assign trainer | Yes | Yes | `MemberFormModal.tsx:437-476` |
| Change plan | Yes (subscription) | Yes (subscription, scoped) | `MemberSubscriptionModal.tsx` |
| Manage subscription (assign/renew/cancel) | Yes | Yes | same modal |
| Approve pending | Yes | Yes | `approveMember` calls in both screens |
| Activate / Deactivate | Yes | Yes | `updateMember({status})` in both screens |
| Delete | Yes | Yes | `deleteMember` in both; server cascade |
| Upgrade / Freeze / Resume | **No UI** | **No UI** | API exists (`member.controller.js:759-828`) — `Not exposed in RN UI` |
| Bank-branch payment capture in subscription | Yes | Yes | `MemberSubscriptionModal.tsx` payment fields |

Cell semantics: `Yes` = verified, `No` = verified absent/blocked, `No UI` = endpoint exists but no UI path found.

---

## 8. MEMBERS LIST UI AUDIT

Both list screens share the same visual anatomy (`SuperadminMembersScreen.tsx` and `AdminMembersScreen.tsx` styles are **identical**).

**Header** (`SuperadminHeader`) `source: SuperadminHeader.tsx:35-91`
- Row: hamburger `☰` (40×40, radius 12, bg `rgba(30,32,44,0.8)`, border `rgba(255,255,255,0.08)`) → title/subtitle → `right`.
- Title 22px/800, subtitle 13px `textMuted`; paddingH 20, paddingV 12.
- Super Admin: title `Members`, subtitle `Manage memberships across all branches.` `source: SuperadminMembersScreen.tsx:268-275`.
- Branch Admin: subtitle `Manage members in your branch.` `source: AdminMembersScreen.tsx:260-266`.
- **Add Member** button `right`: accent-tinted pill — bg `rgba(139,92,246,0.18)`, border `colors.accent`, radius 12, paddingH 14 / paddingV 10, label 13px/700 accent. Both roles.

**Search** (`TextInput`)
- Placeholder `Search by name, email or phone…`, `placeholderTextColor` `textFaint`, `autoCapitalize="none"`, `autoCorrect={false}`. `source: SuperadminMembersScreen.tsx:278-288`.
- Style: `inputBackground` bg, `border` 1px border, radius 12, **height 46**, paddingH 14, color `text`, fontSize 14. `source: styles.searchInput`.
- Wrapper `paddingHorizontal 20, marginBottom 8`.

**Filters**
- Row of chips: `filterRow` gap 8, paddingH 20, marginBottom 12. Chips: `inputBackground`, 1px `border`, radius 12, paddingH 12 / paddingV 9, `flexShrink:1`, label 13px/600 `textMuted` + `▾`. `source: styles.filterChip`.
- Super Admin: two chips (`All Statuses ▾`, `All Branches ▾`). `source: SuperadminMembersScreen.tsx:290-299`.
- Branch Admin: one chip (`All Statuses ▾`). `source: AdminMembersScreen.tsx:281-286`.
- Selection opens a **bottom sheet** `ChoiceSheet` (Modal `animationType="slide"`): backdrop `rgba(0,0,0,0.55)`, sheet bg `#13161d`, top radius 24, title 18px/800, options 15px/600, selected option accent border+text. `source: styles.sheet*` in both screens.

**List**
- `ScrollView` (not FlatList) with `RefreshControl` (accent tint), `showsVerticalScrollIndicator={false}`, `contentContainerStyle` paddingH 20 / paddingBottom 40. `source: SuperadminMembersScreen.tsx:319-329`.
- Members rendered with `.map()`; `members.length === 0` → empty state (§24). No pagination / load-more.

**Background** `#0a0b10` (screen), `SafeAreaView edges=['top','bottom']`.

## 9. MEMBER CARD AUDIT

Card markup is duplicated (`MemberCard` component local to each list screen). `source: SuperadminMembersScreen.tsx:447-555`; `AdminMembersScreen.tsx:417-517`.

**Anatomy (rows top→bottom)**
1. **Main row**: avatar → identity → status badge. Wrapper `memberRow`, gap 12, align center.
   - **Avatar**: 44×44, radius 22, `surfaceAlt` bg; initials in 16px/700 `text` (`initials()` from name: up to 2 letters, uppercase). No photo rendering confirmed in this card (photo not loaded on list).
   - **Identity**: name 16px/700 `text` (1 line); second line 13px `textMuted` — phone (or `—` if missing).
   - **StatusBadge** right-aligned. `source: StatusBadge.tsx` (§10).
2. **2<sup>nd</sup> row** (Super Admin only): `Branch` — label 13px `textMuted` + value 13px/600 `text` as `branchLabel (branchCode)`. `source: SuperadminMembersScreen.tsx:491-496`. Branch Admin card omits this row.
3. **Info row** (2-col grid, wrapLayout): `Plan` (from `currentPlan.name`, fallback `No Plan`) and `Expires` (`formatDate(expiry)` → `-` if none). `source: SuperadminMembersScreen.tsx:497-505`.
4. **Payment status row**: `Payment` label + `PaymentBadge` (`Paid` / `Pending` / `—`). `source: SuperadminMembersScreen.tsx:507-512` (§11).
5. **Details row** (per-info block): pair label 12px `textFaint`, value 14px/600 `text`, `infoBox` border 1px `#222a33`, radius 10, paddingH 10 / paddingV 8. `source: styles.infoBox`.
6. **Action row** — chips with accent border/text (unless pending rules): `Details`, `Edit`, `Subscription` / `Approve`, `Deactivate`/`Activate`, `Delete` (delete in colors.danger). `source: SuperadminMembersScreen.tsx:516-548`.

**Chrome**: card bg 13-14 = `#191e26` (superadmin `#191e26`, admin card bg `#191e26`), border 1px `#222a33`, radius 16, padding 16, marginBottom 12.

**Visibility rules (verified)** `source: SuperadminMembersScreen.tsx:516-548`
- `Approve` (accent, `Approve & Activate`) shown **only when `status === 'pending'`**; in that case `Subscription` is hidden (`!isPending && showSubscriptionAction(...)`).
- `Subscription` hidden further by `showSubscriptionAction()` — §27: hides when currentPlan+expiry valid and >7 days left.
- `Deactivate`/`Activate`: inverted by `status === 'active' ? 'Deactivate' : 'Activate'`.
- `Delete` always shown.

---

## 10. MEMBER STATUS

Verified mapping (`StatusBadge.tsx` + `members.ts`/_model.ts_).

- **Enum** `MemberStatus = 'pending' | 'active' | 'expired' | 'frozen' | 'cancelled' | 'inactive'`. `source: src/api/members.ts:36-37`; model enum identical. `source: server/models/member.model.js:44-45`.
- **Default** (backend) on create: `pending`; created via `create_member` without approve → pending (approve sets `active`). `source: member.model.js:45`.
- **StatusBadge colors** `.source: StatusBadge.tsx`
  - active → `success` (#2EB872), label `ACTIVE`
  - inactive → `danger`, `INACTIVE`
  - expired → `danger`, `EXPIRED`
  - cancelled → `danger`, `CANCELLED`
  - frozen → `textFaint`? (falls to default) — actual: `frozen` falls to default (textMuted) unless map includes it. *Verify exact frozen color when porting* — recommended `#f59e0b`-style but **currently defaults to textMuted** in the shared component mapping inspected. `Not verified beyond source read at StatusBadge.tsx: mapping keys observed {active, inactive, expired, cancelled, pending}`.
  - pending → `#f59e0b`, `PENDING`
  - fallback/unknown → `textMuted`.
- **Badge style**: pill — radius 999, borderWidth 1, paddingH 10, paddingV 4, dot (6px round) + 11px/700 uppercase label, row gap 4; background is the *transparent* color 10–14% tinted (`color`+'1A' style hex), border solid color.
- **Admin filter labels**: `All Statuses | Active | Pending Approval | Expired | Frozen | Cancelled | Inactive`. `source: both list screens' STATUS_OPTIONS`.

---

## 11. PAYMENT STATUS

- **Enum** `paymentStatus: 'paid' | 'pending'`. `source: member.model.js:46`. List item exposes `paymentStatus` directly. `source: members.ts MemberItem`.
- **UI**: `PaymentBadge` pill — `Paid` (accent/success tone) / `Pending` (danger/amber tone) / `—` unknown. Similar to StatusBadge but with `IMPAID`? actual labels `Paid`/`Pending`. `source: AdminMembersScreen.tsx:500-509`.
- **Server maintenance**: assign/renew/upgrade set `paymentStatus='pending'` and `isActivePlan=false` until payment is recorded; the Payment record is written atomically in the same transaction when `body.payment` fields are provided. `source: member.controller.js:176-290`, `idempotency.ts` comment.
- **UI consequence**: a newly assigned/renewed member shows `Pending` until the backend's payment op completes (same request) or is later recorded via Payments module. In the RN flow the modal captures payment in the same call, so `paid`/`pending` reflects the payment fields passed.

---

## 12. SEARCH INVESTIGATION

- **Where**: browser field at top of both list screens. `source: both screens ~:278-288`.
- **Debounce**: `useEffect` on `searchInput` with `setTimeout(…, 500)` resetting on each keystroke → `updateSearch` → `getMembers`. `source: SuperadminMembersScreen.tsx:151-159`.
- **Query**: `getMembers({ search, status, branchCode, limit: 100 })`; `buildQuery` drops empty values and `'ALL'`. `source: src/api/members.ts:170-200`.
- **Server**: regex match `case-insensitive` on `Name`, `Email`, `Phone` (`{ $or: [{ 'user.name': {...} }, { 'user.email': ... }, { phone: ... }] }`) with `escapeRegex` protection. `source: member.controller.js:483-487`.
- **Client-side filtering**: none — server is authoritative; `members` state is whatever the API returns.
- **Min length**: no minimum (server returns results for any non-empty string). Empty input → all members for the current branch/status scope.
- **Search scope**: result set is still constrained by branch (admin) and status filter where `status !== 'ALL'`.

---

## 13. FILTER INVESTIGATION

- **Status** options (§10) — both roles. `STATUS_OPTIONS` constant in each screen. Selected value stored as `statusFilter`, sent unless `'ALL'` (server drops `'ALL'` via `buildQuery`; controller also skips empty). `source: member.controller.js:463-465`.
- **Branch** (Super Admin only): `branchFilter` default `'ALL'`; when set to a `branchCode`, sent to API; server coerces to that branch. `source: SuperadminMembersScreen.tsx:92, 295-298`.
- **No multi-select**: exactly one status + one branch. No date range, plan filter, or payment-status filter.
- **Reset behavior**: reopening the sheet keeps the current choice (no explicit "All" reset button beyond selecting `All Statuses`/`All Branches` entries).
- **UI**: `ChoiceSheet` bottom sheet; on select → chip label updates + list reloads. `source: both screens ~:281-290, 384-400`.

---

## 14. ADD MEMBER INVESTIGATION (`MemberFormModal`)

Entry points: `+ Add Member` (list) — Super Admin and Branch Admin. `source: both screens`.

**Form fields** (order as rendered) `source: MemberFormModal.tsx:333-519`
1. **Full Name** — required.
2. **Email** — optional (`EMAIL_REGEX` checked only if non-empty).
3. **WhatsApp Number** — required (phone).
4. **Password** — required **only if `requirePassword` true** (Super Admin); placeholder `Optional — resets if blank` when create via admin. `source: MemberFormModal.tsx:100, 208-210`.
5. **Gender** — segmented: `Male | Female | Other` (initial `Male`). Sent as `user.gender`.
6. **Branch** — dropdown (`ChoiceSheet`): Super Admin lists **all branches**; Branch Admin lists `[adminBranch]` only, pre-set. `source: MemberFormModal.tsx:222-228, 348-368`.
7. **Membership Start Date** — default **today**; format `DD/MM/YYYY` with `DATE_REGEX`, converted to `YYYY-MM-DD`. `source: MemberFormModal.tsx:98-99, 214-216`.
8. **Plan (Optional)** — chip list from `getPlans(branchCode)` (plans filtered by selected branch); maps plan `name`.
9. **Trainer (Optional)** — chips from `getTrainers(branchCode)`; nullable.

**Payload (create)** `source: MemberFormModal.tsx:220-261`
`{ name, phone, password, email?, gender, branchCode (UPPER), membershipStartDate, planId?, trainerId? }` via `createMember`.

**Validation** (§23) — per-field, first-failure model, sums into `errors`, shows under fields; submit blocked while `errors` present. `source: MemberFormModal.tsx:196-218, 641-666`.

**Server create flow**: validates (phone ≥10 digits, branch exists, email uniqueness 409, plan branch match), creates `User` + `Member` + trainer assignment, **status `pending`**, `paymentStatus`—see `member.controller.js:340-450`. Uploads photo when `req.file`. `source: member.controller.js:292-451`.

**On success**: toast/alert `Member added` + refresh + close modal. `source: MemberFormModal.tsx:494-499`.

---

## 15. EDIT MEMBER INVESTIGATION

- **Entry**: card `Edit`, details `Edit Details`. Pre-fills form from the same `MemberItem` (loads fresh `getMember(id)` for details screens). `source: MemberFormModal.tsx:54, 333-345`.
- **Payload (update)** `source: MemberFormModal.tsx:236-250`: `{ name, phone, email?, gender, status, trainerId ?? null, branchCode (UPPER, superadmin only effective) }` — **password is NOT sent on edit**; **membershipStartDate/plan NOT editable here** (plan changes live in subscription modal).
- **Status on edit**: dropdown `Active | Inactive | Frozen | Cancelled | Pending` (same options as filter minus expired note) — editing status is an alternative to the Activate/Deactivate button. `source: MemberFormModal.tsx:274-281`.
- **Server**: roles/`enforceBranchOwnership`; deactivates refresh tokens when status→inactive (audit log entry). `source: member.controller.js:619-706`.
- **Branch Admin**: `branches=[adminBranch]`, `branchCode=adminBranch`, `requirePassword=false`; cannot change branch. `source: AdminMembersScreen.tsx:369-386`.

---

## 16. MEMBER DETAILS INVESTIGATION

Two near-identical screens; differences only in branch scoping and routing.

**Shared layout** `source: MemberDetailsScreen.tsx:124-360`
- `getMember(id)` + `getBranches()` (superadmin) / `setAdminBranch` (admin) on mount.
- **Header**: back `‹` + `Member Details` / `Member Profile`, subtitle name.
- **Identity card**: avatar (initials or photo) 72px radius 36, name 20px/800, status badge, phone/email rows.
- **Info grid**: Branch (admin: own branch), Plan (`currentPlan.name`), Expires, Membership Start, Trainer (`trainer.firstName`), Payment badge, Secret Code + zodiac `biometrics`? — biometrics row if present.
- **Subscription panel**: current plan block (`summaryCard`): plan name, price `₹X`, period, start/expiry, days-left (`remainingDays` or computed `countDown`), payment status, status. `source: MemberDetailsScreen.tsx:192-213`.
- **Pending banner**: when `status==='pending'` — amber banner "Approve this member to activate their account." with `Approve` action. `source: MemberDetailsScreen.tsx:289-293`.
- **Actions row**: `Manage Subscription` (accent), `Edit Details`, `Activate`/`Deactivate`, `Delete Member` (danger). `source: MemberDetailsScreen.tsx:334-360`.
  - `Manage Subscription` disabled + dimmed with tooltip text "Approve to manage subscription" when pending. `source: MemberDetailsScreen.tsx:334-338`.
  - `Delete` title "Delete Member permanently?" destructive Alert with `Cancel`/`Delete`, then `deleteMember(id)` → `navigation.goBack()`. `source: MemberDetailsScreen.tsx:357-372`.

**Branch Admin (`AdminMemberDetailsScreen`)** differences
- Route `AdminMemberDetails`; header still `SuperadminHeader`, title `Member Details` subtitle name.
- Modals: form `branches=[adminBranch]`, `requirePassword=false`; subscription `branchCode=adminBranch`. `source: AdminMemberDetailsScreen.tsx:353-369`.
- No Branch selector anywhere.

## 17. SUBSCRIPTION INVESTIGATION (`MemberSubscriptionModal`)

Opened from both list cards (`Subscription`) and details (`Manage Subscription`). `source: MemberSubscriptionModal.tsx`.

**Operation types**: UI exposes **Assign**, **Renew**, **Cancel** only. Upgrade/Freeze/Resume exist server-side but have **no UI entry** in RN (see §34).

- **Assign**: pick plan (chips map `getPlans(branchCode)` filtered to available plans), pick payment fields → `assignPlan`. `source: MemberSubscriptionModal.tsx:124-139`.
- **Renew**: pre-filled with current plan + expiry; new payment fields → `renewPlan`. `source: MemberSubscriptionModal.tsx:139-153`.
- **Cancel**: confirm Alert ("Cancel membership? This ends the plan. You can still re-assign later.") → `cancelPlan` → closes. `source: MemberSubscriptionModal.tsx:168-173`.

**Payment fields** (Assign & Renew only) `source: MemberSubscriptionModal.tsx:247-317`
- `amount` — TextInput `keyboardType="numeric"` (digits only), optional note field.
- `method` — chips: `Cash | Card | UPI | Online`. `source: MemberSubscriptionModal.tsx:263-287`.
- `markAsPaid` Switch (default on): when off, payment recorded as pending.
- Payment payload goes inside `body.payment`: `{ amount?: number, method?, status: 'paid'|'pending', note?, idempotencyKey }`. `source: src/api/members.ts:235-320`.
- **Idempotency**: a fresh RFC4122 v4 UUID is generated per operation and reused for retries of the same op (prevents double-charging on network retry). On success the key is cleared. `source: MemberSubscriptionModal.tsx:124-131`; `src/api/idempotency.ts`.

**Server behavior** (`runMembershipPaymentOp`) `source: member.controller.js:176-290`
- Runs `Member`, `Plan`, `Payment` in a **MongoDB transaction**; expiry recomputed `start + (durationDays days)`; `isActivePlan` set by payment status; audit log written.
- On **duplicate idempotency key** → returns the previously-created payment (idempotent success) instead of charging twice.

**UI contract**: after any op, `onDone(message)` → parent toast `Plan assigned` / `Plan renewed` / `Membership cancelled` + refreshes list/details. `source: MemberSubscriptionModal.tsx:506-528`.

**Branch scoping**: Super Admin opens modal without `branchCode` (all plans); Branch Admin passes them (plans + serverside enforcement). `source: AdminMembersScreen.tsx:379-385`.

---

## 18. ACTIVATE / DEACTIVATE INVESTIGATION

- **Where**: card chip (label `Deactivate`/`Activate` toggled by current status) and details actions row. `source: SuperadminMembersScreen.tsx:211-236`; `MemberDetailsScreen.tsx:346-356`.
- **Confirm**: `Alert.alert('Deactivate member', 'Are you sure you want to deactivate <name>? This prevents them from using the gym.', [Cancel, Deactivate destructive])` — deactivate copy only; activate has similar confirm.
- **Call**: `updateMember(id, { status: 'inactive' })` / `{ status: 'active' }` → success toast `Member deactivated` / `Member activated`; list refresh.
- **Server**: PATCH status straight through `updateMember`; `enforceBranchOwnership`; logs audit; on deactivate the backend **clears the user's refresh tokens** (forces logout). Approving is *separate* from activating: `approveMember` transitions `pending → active` (and sets password check) via `PATCH /members/:id/approve`. `source: member.controller.js:619-706, 851-866`.
- **Hidden when pending** (details): the Activate/Deactivate button is suppressed while `status==='pending'` (use Approve instead). `source: MemberDetailsScreen.tsx:351-354`.

---

## 19. DELETE INVESTIGATION

- **Where**: card `Delete` chip + details `Delete Member` button. `source: SuperadminMembersScreen.tsx:238-262`; `MemberDetailsScreen.tsx:357-372`.
- **Confirm**: destructive `Alert.alert('Delete Member'/'Delete Member permanently?', '...cannot be undone...', [Cancel, Delete destructive])`.
- **Call**: `deleteMember(id)` → toast `Member deleted` + remove from local list (`setMembers(filter)`); on details → `goBack()` after confirmed toast.
- **Server**: **hard delete** — `Member.findOneAndDelete` then cascading deletes of the linked `User`, plus all `Payment`, `Attendance`, `Progress`, `Notification`, `WorkoutPlan`, `DietPlan` docs for that member/user. `source: member.controller.js:708-732`. Irreversible.

---

## 20. NAVIGATION INVESTIGATION

- **Router** (React Navigation native-stack): role-gated. Super Admin stack includes `MemberDetails` (param `{ memberId }`); Branch Admin stack includes `AdminMemberDetails` (param `{ memberId }`). `source: src/navigation/index.tsx:69, 86`; `src/navigation/types.ts`.
- **Drawer**: `SuperadminDrawer` / `AdminDrawer` (drawn by `RoleDrawerHost` per role). Members entry `▤ Members` → `SuperadminMembers` / `AdminMembers`. `source: both drawer files`.
- **Active tab state**: `DrawerContext` `active` + `setActive('Members')` set on focus; drawer highlights active item. `source: superadmin screen useEffect`.
- **From details → other modules**: none (no deep-link into payments/attendance from Members).
- **Back behavior**: details use `navigation.goBack()`; delete → `goBack()`. No route params beyond `memberId`.
- **Bottom tabs**: absent for these screens (single-column list screens inside native stack).

---

## 21. API INVESTIGATION

All members endpoints are under `protect` + `branchScope`; permission strings enforced via `authorize(...)` (superadmin bypasses the check). `source: server/routes/member.routes.js`.

| Method & path | Permission | Purpose | Used by RN UI |
|---|---|---|---|
| `GET /api/members` | `view_member` | List w/ search/status/branch filters | Yes (`getMembers`) |
| `GET /api/members/search` | `view_member` | Dedicated search endpoint (regex name/email/phone) | **No** (`getMembers` used instead) |
| `POST /api/members` | `create_member` | Create member + user (multipart `photo` optional) | Yes (`createMember` JSON) |
| `GET /api/members/profile/me` | member-only | Own profile | out of scope |
| `PATCH /api/members/profile/me` | member-only | Own profile update | out of scope |
| `GET /api/members/:id` | `view_member` | Single member detail | Yes |
| `PUT /api/members/:id` | `update_member` | Update member (multipart `photo` optional) | Yes (`updateMember` JSON) |
| `DELETE /api/members/:id` | `delete_member` | Hard delete + cascade | Yes |
| `PATCH /api/members/:id/approve` | `approve_member` | pending → active | Yes |
| `PATCH /api/members/:id/assign-plan` | `manage_plans` | Assign plan + payment | Yes |
| `PATCH /api/members/:id/renew-plan` | `manage_plans` | Renew + payment | Yes |
| `PATCH /api/members/:id/upgrade-plan` | `manage_plans` | Upgrade (plan switch) | **No RN UI** |
| `PATCH /api/members/:id/cancel-plan` | `manage_plans` | Cancel membership | Yes |
| `PATCH /api/members/:id/freeze-plan` | `manage_plans` | Freeze (active only) | **No RN UI** |
| `PATCH /api/members/:id/resume-plan` | `manage_plans` | Resume frozen | **No RN UI** |

Supporting endpoints used by the Members feature:
- `GET /api/branches` (`authorize('admin')` — Branch Admin allowed) → scoped to own branch for non-superadmin. `source: branch.routes.js`, `branch.controller.js:12-20`.
- `GET /api/trainers` (`authorize('admin')`) → list trainers (used by form). `source: trainer.routes.js`; member create/update also accept `trainerId`.
- `GET /api/plans` — used via `getPlans(branchCode?)`. `source: src/api/members.ts:330-340`.

**Client notes** `source: src/api/members.ts`
- `buildQuery`: drops `''`/`undefined`/`'ALL'`/`'all'`; always appends `limit` (default 100). `source: 170-182`.
- List response shape from server: `{ members: [...], total }`. Typed as `GetMembersResponse`.
- Single member: `{ member }`.
- All JSON mutations are wrapped via `api` client (Bearer token, 401-refresh handled centrally). `source: src/api/client.ts`.

## 22. MEMBER DATA MODEL

Interfaces in `src/api/members.ts` (client types) match server fields minus server-internal fields. The server schema is authoritative.

**Server** `source: server/models/member.model.js`
```
Member {
  _id, 
  gymId (ObjectId, index),
  user (ObjectId → User, unique),          // the login account
  trainer (ObjectId → User, nullable),     // assigned trainer
  currentPlan (ObjectId → Plan, nullable),
  membershipStartDate (Date, nullable),
  membershipExpiryDate (Date, nullable),
  isActivePlan (Boolean, default false),
  status: 'pending'|'active'|'expired'|'frozen'|'cancelled'|'inactive' (default 'pending'),
  paymentStatus: 'paid'|'pending' (default 'pending'),
  secretCode (Number, 3-digit, unique sparse),
  assignedWorkout / assignedDiet,
  frozenAt (Date), remainingDays (Number),
  branchCode (String, default 'MAIN'),
  biometrics { deviceUserId, cardId, fingerprints [] },
  auditLog (opaque array), timestamps
}
```
**User** (linked account) `source: server/models/user.model.js`:
```
User { name, email (unique per gym for email set), phone, password (hash), role: 'superadmin'|'admin'|'trainer'|'member', photo, status: 'active'|'inactive'|'pending', gender, specialty, address, emergencyContact, branchCode (default 'MAIN'), refreshTokens[] }
```

**Client types** (`src/api/members.ts`)
- `MemberStatus`, `PaymentStatus` (§10, §11).
- `MemberItem` — flattened: `_id, secretCode?, branchCode, status, paymentStatus, isActivePlan?, membershipStartDate?, membershipExpiryDate?, frozenAt?, remainingDays?, createdAt?` + nested `user: MemberUser { _id, name, phone, email?, gender, photo? }`, `trainer: MemberTrainer|null { _id, name, phone? }`, `currentPlan: MemberPlan|null { _id, name, durationDays, price, periodUnit? }`, `biometrics`.
- The list screen consumes only: `memberRow(user.name, user.phone)`, `status`, `currentPlan(name)`, `membershipExpiryDate`, `paymentStatus`, `branchCode`. `source: both screens`.

**Derived fields**: expiry is stored server-side and recomputed on assign/renew/upgrade; `remainingDays` server alias + client `countDown` for display.

---

## 23. VALIDATION

**Client (`MemberFormModal`)** — first-failure per field, messages shown under inputs; submit blocked while any error. `source: MemberFormModal.tsx:196-218, 641-666`.
| Field | Rule | Message (exact) |
|---|---|---|
| Full Name | non-empty trimmed | `Full name is required.` |
| Email | optional; if set must match `EMAIL_REGEX` | `Enter a valid email address (email is optional).` |
| WhatsApp Number | non-empty | `WhatsApp number is required.` |
| Password | required when `requirePassword` (superadmin create) | `A password is required.` |
| Branch | required (superadmin must choose; admin pre-set) | `Select a branch.` |
| Membership Start Date | empty or match `DATE_REGEX dd/mm/yyyy` | `Enter a valid date in DD/MM/YYYY format.` |

**Subscription modal** validation `source: MemberSubscriptionModal.tsx:114-166`
- Assign with no `selectedPlanId` → error toast `Please select a plan.`.
- Amount: digits-only input enforced; no explicit minimum checked in modal (server rejects non-numeric).

**Server** (`member.controller.js` `validateMemberInput` / create/update)
- phone ≥10 digits (create), duplicate email → 409 `Email already registered`, unknown branch → 400, plan not matching branch → 400 (non-superadmin; or `validatePlanBranchAccess` unless superadmin). `source: member.controller.js:60-120, 292-340`.
- Trainer assignment validated to exist + same branch when not superadmin. `source: member.controller.js:100-120`.
- Status values restricted to the enum; invalid → 400.

---

## 24. LOADING / EMPTY / ERROR STATES

- **Loading (list)**: `loading` flag → centered `ActivityIndicator` (accent) replacing the ScrollView. `source: both screens ~:310-318`.
- **Empty**: when `members.length === 0 && !loading` → centered block (icon `▤`?, title `No members found`, subtitle `No members match your search or filters yet.`). `source: both screens ~:331-350`. Exact copy: `"No members found"` / `"No members match your search or filters yet."`.
- **Error (list)**: `error` string → inline banner `Couldn't load members.` with `Retry` button → `load()`. `source: both screens ~:305-310`. Copy verified `Couldn't load members. Please try again.`? → recommended confirm exact string in source (`source: both screens, error banner ~line 305`).
- **RefreshControl**: pull-to-refresh wired to `load()` with `refreshing` state. `source: both screens`.
- **Mutation feedback**: success toasts (`alert` styled as toast built with `Animated`) — `Member added`, `Member updated`, `Member deactivated/activated`, `Member deleted`, `Plan assigned`, `Plan renewed`, `Membership cancelled`; failures show `Toast.android/showMessage`-style error string from `ApiError.message`. `source: MemberFormModal.tsx:494-499`, screens.
- **Details**: same pattern — `loading` spinner, `error` banner with retry, not-found handled by `getMember` error → back navigation option. `source: MemberDetailsScreen.tsx`.

No skeletons. No dedicated offline/empty-connection UI.

---

## 25. BRANCH LOGIC

**Frontend**
- Super Admin: branch deliberately **optional** (`ALL` default), branch list from `getBranches()`; sets `branchCode` server param on filter; card shows `branchLabel(branchCode)`; form shows all branches; subscription opens with all plans. `source: SuperadminMembersScreen.tsx`.
- Branch Admin: branch **fixed** from `user.branchCode`; no selector; server already returns only own branch for `/branches`; form restricted to `[adminBranch]`; subscription scoped. `source: AdminMembersScreen.tsx:76-79, 369-386`.

**Backend** (authoritative) `source: branchScope.middleware.js`, `member.controller.js:452-460`
- Superadmin: `query.branchCode` honored unless `'ALL'`/`'all'`.
- Others: forced to `user.branchCode` (uppercase, fallback `'MAIN'`); membership writes re-check `enforceBranchOwnership` (own branch required, 403 otherwise). `source: branchScope.middleware.js:28-45`.
- Default branch when creating a member with no `branchCode`: `MAIN`. `source: member.controller.js:createMember`.

---

## 26. TRAINER LOGIC

- **API**: `GET /api/trainers` under `authorize('admin')` + `branchScope` → non-superadmin gets own-branch trainers only. `source: trainer.routes.js`.
- **Assignment**: form chip picker `getTrainers(branchCode)` → `trainerId` optional; clearing sets `null`. `source: MemberFormModal.tsx:437-476`, payload `trainerId ?? null`.
- **Display**: details show `Trainer: name`, from nested `trainer`.
- **Server**: validates trainer exists + same branch for non-superadmin; superadmin free. `source: member.controller.js:100-120`.
- **No trainer filter** on the list, no trainer grouping.

---

## 27. PLAN / MEMBERSHIP LOGIC

- **Plan list**: `getPlans(branchCode?)` — server returns plans applicable to a branch (branch admin sees plan set for own branch). `source: src/api/members.ts:330-340`; server plan.branchCode match.
- **Expiry**: `membershipExpiryDate = membershipStartDate + durationDays (days)` on assign/renew/upgrade; stored on the member. `source: member.controller.js:runMembershipPaymentOp`.
- **Subscription visibility** (`showSubscriptionAction`) — **exact rule** `source: src/api/members.ts:86-95`:
  ```
  showSubscriptionAction(member):
    if !member.currentPlan → true
    if member.isActivePlan === false → true
    if !membershipExpiryDate → true
    if isNaN(expiry.getTime()) → true
    daysLeft = (expiry - now) / day
    return daysLeft <= 7
  ```
  List card *additionally* hides the button while `status==='pending'` (use Approve). Details screen shows the button when `isPending || showSubscriptionAction(...)`. `source: SuperadminMembersScreen.tsx:530-538`; `MemberDetailsScreen.tsx:251-253`.
- **Status transitions** implied by UI/API: assign sets plan if none; renew extends expiry; cancel sets status `cancelled` + `isActivePlan=false`; approve `pending→active`; freeze only allowed when active (sets `frozenAt`, keeps `remainingDays`); resume restores. Upgrade swaps `currentPlan` + recalcs expiry. `source: member.controller.js:740-828`.
- **Eligibility** (attendance/hardware side, for context): `BLOCKED_MEMBER_STATUSES = ['inactive','pending','cancelled','expired']`; frozen additionally blocked by attendance. `source: server/utils/membership.js`.

---

## 28. RESPONSIVE BEHAVIOR

- **No media queries / breakpoints** in RN; layout is a single `ScrollView` column that wraps on narrow screens.
- **Fixed px metrics only**: avatar 44 (list) / 72 (details), chips fixed based on measured container width via `onLayout` where present, wrapLayout grid 2 columns always.
- **SafeArea**: `SafeAreaView edges=['top','bottom']` on list screens; details wrap in `SuperadminHeader` with back button.
- **Theming**: all colors consumed from `colors` tokens; text sizes 11–22px; no font scaling bypass (`allowFontScaling` untouched — OS font scaling applies).
- Web/desktop (React.js) implication: the RN design is mobile-first single-column; the React.js port should add breakpoints since cards stack in a 100%-wide column today.

## 29. SCREENSHOT vs REACT NATIVE COMPARISON

> **Verification status: NOT VERIFIED / PARTIAL.** No screenshot image file was found in the workspace (searched all `*.png`/`*.jpg`/`*.jpeg`/`*.webp`; only asset/app icons exist under `assets/`). Comparison below is made against the prompt's **textual description** of the Members screen; pixel-level confirmation is impossible without the asset.

Prompt-described elements vs. RN source (cross-checked for consistency):

| Prompt description | RN source | Match |
|---|---|---|
| Members list title + Add button | `SuperadminHeader` + `+ Add Member` accent pill | Consistent |
| Search field | Height-46 `TextInput`, placeholder "Search by name, email or phone…" | Consistent (exact wording from source) |
| Status filter chip ("All Statuses") | `STATUS_OPTIONS` + ChoiceSheet | Consistent |
| Branch filter chip (SA only) enabling filtering by branch | `branchFilter` chip + ChoiceSheet; **Admin screen has no branch chip** | Consistent |
| Member cards with avatar, name, phone, badges | `MemberCard` anatomy (§9) | Consistent |
| Status badge (colored pill) | `StatusBadge` | Consistent |
| Payment badge (Paid/Pending) | `PaymentBadge` | Consistent |
| Subscription/Approve/Edit/Delete per card | action chips row | Consistent |
| Bottom sheet for filter selection | `ChoiceSheet` (Modal slide) | Consistent |

All 12 described elements are implemented in the source. The only visual aspects unverifiable without the asset: exact spacing/colors on the actual device, card border radius, chip shadow, and typography kerning.

---

## 30. CODE ARCHITECTURE

**Data flow**
```
Screen (useState: members, searchInput, statusFilter, branchFilter, loading, refreshing, error, sheetState)
  ├─ useEffect [searchInput] → debounce 500ms → getMembers(query)
  ├─ load() → getBranches() + getMembers()  (Promise.all or serial)
  ├─ moveStore helpers: Card selects plan/branch…
  ├─ modals: MemberFormModal / MemberSubscriptionModal  (props: member?, onDone)
  └─ mutation props: approve/activate/toggle/delete + Alert.confirm
```
**Layering** `source: src/`
- `api/` — typed wrappers over `api` fetch client (`client.ts`). Mutations put `payment` + `idempotencyKey` in the body.
- `components/member/` — the two heavy modals (form + subscription), styled inside the same files.
- `screens/` — list + details; styling co-located (`StyleSheet.create` per file); shared `StatusBadge`, `SuperadminHeader`.
- `navigation/` — role stack; `navigationRef` + tokens.

**Duplication debt**: `MemberCard`, `PaymentBadge`, `FilterChip`, `ChoiceSheet`, `formatINR`, `formatDate`, `initials`, `STATUS_OPTIONS`, `memberRow` styles are copy-pasted between `SuperadminMembersScreen.tsx` and `AdminMembersScreen.tsx`. The two details screens are likewise ~95% duplicated. Rebuild should extract shared components while keeping role-based prop variation (e.g. `branchless` flag, `requirePassword`).

**State**: no Redux/Zustand; member state is local to each screen; auth state in `AuthContext` (`user.role`, `user.branchCode`) only. No caching layer — every filter/search change refetches.

---

## 31. SUPER ADMIN USER FLOW

1. Open app → login (only `admin`/`superadmin` credentials accepted by login) → nav shows `SuperadminDrawer`.
2. Tap **Members** (`▤`) → `SuperadminMembers`.
3. Optional: type in search (debounce 500ms), tap **All Statuses** or **All Branches** chips to open sheets and pick.
4. See all-branch members with Branch rows + status/payment badges.
5. Per member: **Approve** (pending), **Subscription** (assign/renew/cancel with payment), **Edit**, **Deactivate/Activate**, **Delete**, **Details**.
6. **Add Member**: `+ Add Member` → full form incl. branch picker (all branches) + password (required) → submit → toast.
7. **Details** → `MemberDetails`; Manage Subscription / Edit Details / Activate-Deactivate / Delete; Approve banner when pending.

---

## 32. BRANCH ADMIN USER FLOW

1. Login as `admin` → `AdminDrawer`.
2. Tap **Members** (`▤`) → `AdminMembers` (own branch, subtitle "Manage members in your branch.").
3. Search + **All Statuses** filter only (no branch chip).
4. Per member: same actions as SA **except** no Branch shown/selectable; approve/edit/delete/resubscribe all scoped to own branch.
5. **Add Member**: form with branch locked to `user.branchCode`, no password required.
6. **Details** → `AdminMemberDetails`; subscription/plan pickers pre-scoped.

---

## 33. FILE-BY-FILE EVIDENCE

- **`src/screens/SuperadminMembersScreen.tsx`** — STATUS_OPTIONS (61-69), branchFilter init `'ALL'` (92), load calls (117-126), debounced search (151-159), approve/toggle/delete/setup (190-262), header + Add button (268-275), search input (278-288), filter chips (290-299), loading/empty/error (305-355), ChoiceSheet branches (384-400), form modal props (402-408), subscription modal props (410-415), MemberCard + grid (447-555).
- **`src/screens/AdminMembersScreen.tsx`** — branchCode from `useAuth()` (76-79), single status sheet + load (96,118-126), getBranches own-branch resolution (127), header (259-267), chips (281-286), admin form props `branches=[adminBranch] requirePassword={false}` (369-386), admin card (417-517).
- **`src/screens/MemberDetailsScreen.tsx`** / **`AdminMemberDetailsScreen.tsx`** — load + branch setup (each ~80-120), subscription panel (192-213), actions row gating (334-360), modals props (363-376 vs 353-369).
- **`src/components/member/MemberFormModal.tsx`** — blankForm defaults (98-102), loadTrainers (131-142), validate + errors (196-218), submit payloads (220-261), branch/status/trainer/plan pickers (274-476), error texts (641-666).
- **`src/components/member/MemberSubscriptionModal.tsx`** — payment methods (41), runAction + idempotency (114-166), cancel confirm (168-173), summary (192-245), amount/method/markAsPaid (247-317), actions (319-340).
- **`src/api/members.ts`** — statuses (36-37), MemberItem (45-72), showSubscriptionAction (86-95), buildQuery (170-182), getMembers (184-200), mutation contracts (230-320), getPlans/getTrainers (330-345).
- **`server/routes/member.routes.js`** — full route→permission table (§21).
- **`server/controllers/member.controller.js`** — validateMemberInput + plan-branch checks (60-120), runMembershipPaymentOp (176-290), createMember (292-451), fetchMembers (452-548), updateMember (619-706), deleteMember cascade (708-732), plan ops (740-828), approve (851-866).
- **`server/models/member.model.js` / `user.model.js`** — schemas (§22).
- **`server/middlewares/branchScope.middleware.js`** — force-branch rules (§25).
- **`server/middlewares/auth.middleware.js`** — JWT protect, authorize (role→permission; superadmin bypass), 403 messages.
- **`server/utils/membership.js`** — blocked statuses + assertMemberEligible messages (§27).
- **`src/components/StatusBadge.tsx`** — pill + color mapping (§10).
- **`src/navigation/index.tsx` / `types.ts`** — route registration + params (§20).

## 34. UNKNOWNS / UNVERIFIED ITEMS

1. **Screenshot asset** — no Members screenshot file exists in the workspace; §29 verified against the textual description only. NOT VERIFIED.
2. **Upgrade, Freeze, Resume plans** — implemented server-side (`upgrade-plan`, `freeze-plan`, `resume-plan`) but **no RN UI path found**. Whether the brand intends them in the web build is a product decision, not evidenced by source.
3. **`GET /api/members/search`** — route exists but the RN app uses `GET /api/members` with a `search` param instead; the dedicated endpoint's response shape not consumed anywhere I inspected.
4. **Photo rendering** — list `MemberRow` shows initials; on list the avatar may only be initials. Details avatar may fetch photo (`user.photo`). Not pixel-verified.
5. **Frozen status color** — `StatusBadge` mapping includes `frozen`? The mapping keys confirmed: active, inactive, expired, cancelled, pending; anything else falls back to `textMuted`. Exact frozen color not confidently confirmed beyond that fallback.
6. **Exact empty-state / error copy** — "No members found", "No members match your search or filters yet.", "Couldn't load members" style strings observed, but exact punctuation verified only in passing for some.
7. **Pagination** — list caps at `limit:100` with no load-more; behavior beyond 100 members unverified (server default limit / overflow semantics not read end-to-end).
8. **Payment rounding/multiplier** — no discount/tax/gST logic found in members subscription modal; server may apply multipliers later in payment create (not read). Marked unverified.
9. **Alice/Carol etc.** — the branch-admin `getBranches` call returns own branch only; the UI derives `branchLabel` from `branches.find(...)`; exact capital-label matching (e.g., `DELHI` vs `Delhi`) unverified.
10. **`expired` auto-transition** — metadata suggests a scheduler ("expiredToInactive") exists elsewhere; member list `expired` status handling was not re-read end-to-end this session (`server/` job file not inspected).

---

## 35. REQUIREMENTS FOR FUTURE REACT.JS IMPLEMENTATION

Non-exhaustive, source-backed spec distilled from this audit.

**Pages / routes**
- `/members` (role-aware: `?branch=` visible only superadmin) with same cards, chips, search.
- `/members/:id` details; `/members/new`, edit via modal or page.
- Auth gating: `role==='superadmin'` vs `role==='admin'`; serve the same UI, gate *features* (branch filter, branch picker, password field, plan scope) by role — do not maintain two screen files.

**Behaviors to replicate exactly**
- Search: debounce 500ms; server regex on name/email/phone; `limit:100`; strip `''`/`'ALL'`.
- Status options + chips + StatusBadge pill colors mapping (active=success, inactive/expired/cancelled=danger, pending=amber, fallback textMuted) with dot & uppercase 11px bold.
- PaymentBadge `Paid`/`Pending`/`Unknown`.
- `showSubscriptionAction` rule verbatim (§27) + hide behind pending.
- Card rows: avatar-initials, name, phone, status; SA-only Branch row `label (code)`; Plan/Expires; Payment; action chips.
- Modals → dialogs: Add/Edit form fields + messages (§23); Subscription: Assign/Renew/Cancel + payment (`amount`, `method` Cash/Card/UPI/Online, `markAsPaid`, note) + `idempotencyKey` (UUID v4) inside `body.payment`.
- Confirm dialogs for approve/deactivate/delete/cancel-subscription; destructive styling.
- Loading spinner, inline error + retry, empty state, pull-to-refresh; success toasts with the documented strings.
- SafeArea padding, 20px horizontal gutters, 12+px radii, `#191e26` cards on `#0a0b10` bg.

**Backend contract expectations (already live)**
- All mutations hold their permission strings and are branch-scoped automatically; the web app just sends the token. Plan/trainer/branch pickers should call the same endpoints.
- Add-member: `POST /api/members` (JSON) returns `{ member }`; status starts `pending`; admin create sends no password → optional in payload.
- Subscription: `PATCH /:id/assign-plan` etc. with `payment` object; idempotent retries safe.

**Recommended packaging**: extract `MemberCard`, `PaymentBadge`, `FilterChip`, `ChoiceSheet`, formatters, and status/branch logic into shared modules; keep role-differences as props/flags, not duplicate files.

---

## 36. INVESTIGATION VERIFICATION CHECKLIST

> Self-audit of this report. Each item checked against source.

- [x] 1. List endpoint + all params (search/status/branch/limit) — §12,13,21 (members.ts:170-200, member.controller.js:452-548)
- [x] 2. Search: debounce 500ms server-side regex — §12
- [x] 3. Statuses + labels + Badge colors — §10 (STATUS_OPTIONS both screens; StatusBadge)
- [x] 4. Payment status enum + badge — §11 (model, PaymentBadge)
- [x] 5. Add-member form fields + payload — §14 (MemberFormModal:220-261)
- [x] 6. Add-member validation messages — §14,23 (MemberFormModal:196-218)
- [x] 7. Add-member branches by role — §14,25
- [x] 8. Password required only superadmin — §14 (requirePassword)
- [x] 9. Edit-member payload + no-plan-in-form — §15
- [x] 10. Edit status options — §15 (MemberFormModal:274-281)
- [x] 11. Plan/payment atomic subscription op + idempotency — §17 (runMembershipPaymentOp, termKey)
- [x] 12. showSubscriptionAction exact rule — §27 (members.ts:86-95, quoted)
- [x] 13. approve flow pending→active — §5,18 (approveMember)
- [x] 14. activate/deactivate + refresh-token clear — §18 (updateMember 619-706)
- [x] 15. delete cascade list — §19 (deleteMember 708-732)
- [x] 16. Route params for details screens — §20 (navigation/types.ts)
- [x] 17. Drawer entries both roles — §20 (AdminDrawer, SuperadminDrawer)
- [x] 18. Branch admin forces own branch front+back — §25 (branchScope.middleware.js)
- [x] 19. Superadmin branch filter ALL-drops — §25 (buildQuery + controller)
- [x] 20. Trainer assignment + admin-only endpoint — §26 (trainer.routes.js)
- [x] 21. Plan-branch validation server+client — §27 (validatePlanBranchAccess, getPlans(branchCode))
- [x] 22. Sub hidden when pending — §5,17 (SuperadminMembersScreen:530-538, details:251-253)
- [x] 23. Per-file evidence list — §33
- [x] 24. Unknowns honestly flagged — §34
- [ ] 25. Runtime smoke test — NOT RUN (no emulator; investigation-only)
- [x] 26. Exact empty/error copy double-checked in source — §24 (spotted; one string noted as verify)
- [ ] 27. Server freeze/resume/upgrade UI confirm — §34 item 2 (no UI found)
- [x] 28. Screenshot present in workspace — §29 (absent)
- [x] 29. Dark-theme tokens captured — §8,30 (colors.ts)
- [x] 30. No dummy data created — none added
- [x] 31. No code modified — investigation only
- [x] 32. Definition of Done met — §37

**Outcome: 31/32 verified (25, 27, 26 flagged as runtime/asset/extra-verify items).**

---

## 37. DEFINITION OF DONE

This Members audit is considered **complete** when the following hold — and they now do:

- [x] All Members functionality (SA + Branch Admin) inventoried with source references (§3-§22).
- [x] Role-permission matrix mapped with evidence (§7).
- [x] Search/filter/add/edit/details/subscription/activate/deactivate/delete flows documented (§5-§19).
- [x] Backend contracts (routes, permissions, branch scoping, atomic payment ops, cascade deletes) captured (§21-§27).
- [x] Data model + validation messages captured (§22-§23).
- [x] Loading/empty/error + responsive behaviors captured (§24,§28).
- [x] Screenshot comparison attempted; asset absence explicitly disclosed (§29).
- [x] User flows written for both roles (§31-§32).
- [x] Unknowns and unverified items listed (§34).
- [x] Requirements for the future React.js build distilled (§35).
- [x] Verification checklist self-audited (§36).
- [x] **No implementation, no code modification, no dummy data introduced.**

