# A1 FITNESS — PLANS COMPLETE AUDIT

> Investigation-only audit of the **Plans** feature of the A1 Fitness React Native app.
> Purpose: authoritative SOURCE-OF-TRUTH document so the Plans feature can be rebuilt in a fresh React.js application without re-reading the RN codebase.
>
> **No implementation was performed. No code was modified.** Every claim is backed by `src/` / `server/` source references. Anything not verifiable is explicitly marked in §38.
>
> **Screenshot status (REPEATED IN §29):** no Plans screenshot image file exists anywhere in the workspace (searched all `*.png|jpg|jpeg|webp`; only app-icon assets exist under `assets/`). Visual comparison in §29 is against the prompt's textual description only.

---

## 1. EXECUTIVE SUMMARY

The Plans feature is **two role-scoped screens**:

- **`SuperadminPlansScreen.tsx` (1,243 lines)** — the **complete feature**: read-only list **plus** an inline Add/Edit plan modal, an inline **Apply-to-Branch** modal, an inline **View/Remove Branch** modal, and native `Alert.alert` confirmation for Delete. **There are no separate routes/screens/modals for Add Plan, Edit Plan, Apply-Plan, or Delete** — everything lives inside this single file (modals rendered by local `<Modal>` components).
- **`AdminPlansScreen.tsx` (303 lines)** — a **read-only** list of plans that have been applied to the admin's branch. No Add/Edit/Delete/Apply UI and none available to the admin through the API.

The backend (`server/`) is present in the workspace and is the authoritative contract:

- `GET /api/plans` is open to **any authenticated user**; server scopes results to the user's branch for non-superadmins (only plans with an **active `PlanBranch` row for that branch** are returned).
- `POST /api/plans`, `PATCH /api/plans/:id`, `DELETE /api/plans/:id` are **superadmin-only** (`authorize("superadmin")`).
- `POST/DELETE /api/plans/:planId/branches` are **superadmin-only in practice** (the controller rejects non-superadmins with 403 even though the route layer does not).

Key model facts:

- **`Plan`** — `name`, `price` (≥0), `duration` (days, ≥1), `features: string[]`, legacy `branchCode` field (`null` | `"ALL"` | code — **not written by create**, retained for backwards compatibility), unique per-gym `{name, branchCode}`.
- **`PlanBranch`** — junction `{planId, branchCode, status: active|inactive}`, unique per gym `{planId, branchCode}`. This is the real many-to-many plan↔branch relationship.
- **Apply semantics**: applying creates a `PlanBranch` row (or re-activates a soft-deactivated one). Removing **hard-deletes** the row. Deleting a plan **deletes all its PlanBranch rows**.
- **Delete restriction**: a plan **cannot be deleted** while any **active member** uses it (400). A plan **cannot be removed from a branch** while active members in that branch use it (400).
- **Branch-scoped visibility**: admins see only applied plans; superadmins see everything. The per-card indicator (`appliedBranches[]`) is attached server-side on **list** responses only (not on create/update responses — the UI always refetches after a mutation).

Validation is split front/back: the RN form validates name/price/duration with specific messages; the server re-validates on `create` and `update` (400s) and enforces duplicate names (409).

---

## 2. FEATURE SCOPE

- **In scope:** Plans list (superadmin + branch-admin), Add Plan, Edit Plan, Apply Plan to Branch, View/Remove Plan Branch, Delete Plan confirmation, in-screen navigation, APIs + backend contracts, role/branch permissions, loading/error/empty/success UI, shared components and styling.
- **Out of scope:** the member-facing app, Trainer-role UI, and other modules (Members/Payments/Attendance) except where Plans intersects (member `currentPlan` gating delete/remove).
- **Method:** static source inspection of `src/` and `server/`. No runtime execution; no screenshot asset available.

---

## 3. SOURCE FILES INVESTIGATED

### React Native app (`src/`)
| File | Purpose | Relation to Plans |
|---|---|---|
| `src/screens/SuperadminPlansScreen.tsx` | Superadmin Plans screen: list + Add/Edit modal + Apply-to-Branch modal + View/Remove-branches modal + delete flow | **The whole feature** |
| `src/screens/AdminPlansScreen.tsx` | Branch-admin read-only Plans list | Read-only Plans |
| `src/api/plans.ts` | `PlanItem`, `PlanBranch`, `PlanPage`, payloads, `listPlans`/`createPlan`/`updatePlan`/`deletePlan`/`applyPlanToBranch`/`removePlanFromBranch`/`getPlanBranches` | **API client** |
| `src/api/branches.ts` | `BranchItem` (name/branchCode/status), `getBranches(limit=100)` | Branch data for Apply modal |
| `src/api/client.ts` | Fetch wrapper, `ApiError`, Bearer auth, 401-refresh/retry, message mapping | HTTP plumbing |
| `src/components/SuperadminHeader.tsx` | Shared header (hamburger/title/subtitle/`right`) | Header of both screens |
| `src/components/drawer/DrawerContext.tsx` | `DrawerKey` ('Plans'), `setActive`, `open` | Active-nav state |
| `src/components/drawer/SuperadminDrawer.tsx` | Drawer with `Plans ▧ → SuperadminPlans` | Nav entry (SA) |
| `src/components/drawer/AdminDrawer.tsx` | Drawer with `Plans ▧ → AdminPlans` | Nav entry (Admin) |
| `src/navigation/index.tsx` | Role-gated stack registration | Route registration |
| `src/navigation/types.ts` | `AppStackParamList` (`SuperadminPlans`, `AdminPlans`: undefined) | Route params |
| `src/theme/colors.ts` | Design tokens (§30) | Styling |
| `src/config/api.ts` | `API_BASE_URL` from `EXPO_PUBLIC_API_URL` | Base URL |

### Backend (`server/`)
| File | Purpose |
|---|---|
| `server/routes/plan.routes.js` | Route definitions + guards |
| `server/controllers/plan.controller.js` | `createPlan`, `listPlans`, `updatePlan`, `deletePlan`, `applyPlanToBranch`, `removePlanFromBranch`, `listPlanBranches` |
| `server/models/plan.model.js` | Plan schema |
| `server/models/planBranch.model.js` | PlanBranch junction schema |
| `server/models/generic.model.js` | `Branch` schema |
| `server/models/member.model.js` | `Member.currentPlan` (used for delete/remove guards) |
| `server/middlewares/auth.middleware.js` | `protect`, `authorize`, role→permission map |
| `server/middlewares/error.middleware.js` | Error response shape |
| `server/utils/response.js` / `pagination.js` | Success response shape, pagination defaults |
| `server/server.js` | Mounts `/api/plans`; CORS origins (`localhost:5173`, Vercel) |

---

## 4. PLANS SCREEN ARCHITECTURE

Derived from source (no assumption). Both screens are **self-contained**; neither uses a separate Plans component file.

### Super Admin (`SuperadminPlansScreen.tsx`)
```
SuperadminPlansScreen
├── useDrawer() → setActive('Plans')                (active nav highlight)
├── Header  (SuperadminHeader)
│   ├── Title  "Plans"
│   ├── Subtitle "Create and manage membership plans."
│   └── right = <+ Add Plan> button → openCreate()
├── List area (conditional)
│   ├── loading → <ActivityIndicator> + "Loading plans..."
│   ├── error   → ⚠ + message + <Retry>
│   ├── empty   → ⚡ "No plans created yet" + text + <Add First Plan>
│   └── FlatList → PlanCard (local renderPlanCard)
│       ├── ⟨name + "N days" ⟩  ⟷  ₹price
│       ├── features (first 3 ✓ bullets, "+N more", or "No features listed")
│       ├── branchSection (pressable → openViewBranches)
│       │   └── "AVAILABLE IN N BRANCHES" + branchCode chips / "Not applied to any branch"
│       └── actionsRow
│           ├── [Apply to Branch] (primary) → openBranchModal(plan)
│           ├── [Edit]                     → openEdit(plan)
│           └── [Delete]                   → confirmDelete(plan)
├── Modal: Add/Edit Plan  (formVisible)
│   ├── FormField Plan Name *        (TextInput)
│   ├── row: FormField Price ₹ *     (TextInput numeric)
│   │        FormField Duration (days) *  (TextInput numeric)
│   ├── FormField Features
│   │   ├── feature input + [+ add]
│   │   └── feature tags (with ✕)
│   └── actions: [Cancel] [Create Plan | Save Changes]
├── Modal: Apply to Branch  (branchModalVisible)
│   ├── title "Apply "<name>""
│   ├── branch rows (from getBranches, active only)
│   │   ├── name + code
│   │   └── [Applied badge] | [Apply] (per-row spinner)
│   └── (no cancel/submit button; rows apply immediately)
└── Modal: View Applied Branches  (viewBranchesVisible)
    ├── title ""<name>" branches"
    ├── rows: branchCode + status (active/inactive color) + [Remove]
    └── (Remove → Alert confirm)
```

### Branch Admin (`AdminPlansScreen.tsx`)
```
AdminPlansScreen
├── useDrawer() → setActive('Plans')
├── useAuth() → branchCode = user?.branchCode ?? ''
├── Header (SuperadminHeader)
│   ├── Title "Plans"
│   └── Subtitle "Membership plans available in your branch."
├── List area (conditional) — same loading/error/empty pattern
│   └── FlatList → PlanCard (local, READ-ONLY)
│       ├── name + duration
│       ├── ₹price
│       ├── green pill "Available in your branch"
│       └── features (first 3, "+N more" | "No features listed")
└── NO other modals/actions at all
```

---

## 5. PLANS LIST UI

Both screens share the same background / header / spacing tokens. Details below are from the styles, with source line refs.

**Shared chrome**
- Screen background: `#0a0b10` (hard-coded), `SafeAreaView edges={['top','bottom']}`. `source: SuperadminPlansScreen.tsx:757-760`; `AdminPlansScreen.tsx:151-154`.
- Header: `SuperadminHeader` (paddingH 20, paddingV 12; hamburger 40×40, radius 12, bg `rgba(30,32,44,0.8)`, border `rgba(255,255,255,0.08)`; title 22px/800; subtitle 13px `textMuted`). `source: src/components/SuperadminHeader.tsx`.
- Content container: `paddingHorizontal: 20, paddingBottom: 40`. `source: styles.listContent` in both files.

**Super Admin extra chrome**
- `+ Add Plan` button (header `right`): bg `rgba(139,92,246,0.18)`, 1px accent border, radius 12, paddingH 14 / paddingV 10, text 13/700 accent. `source: SuperadminPlansScreen.tsx:429-432, 790-802`.

**Spacing / dividers summary**
- Card: radius 16, padding 16, marginBottom 12. `source: styles.card`.
- Inside card: top row marginBottom 10; features + branch sections separated by `borderTop` `rgba(255,255,255,0.06)`; actions row top border + paddingTop 12 + `gap: 8`. `source: styles.featuresSection` (SA) / `AdminPlansScreen styles.featuresSection` (uses borderTop there); `styles.actionsRow`.

**Loading / Empty / Error** — see §26 for full copy and layout (`styles.centered`, `retryButton`, `emptyBox`).
## 6. HEADER

Shared `SuperadminHeader` component (`src/components/SuperadminHeader.tsx`) used by both screens. Behaviors verified:

- Layout: row → hamburger → title/subtitle block → optional `right` slot.
- Hamburger 40×40, radius 12, bg `rgba(30,32,44,0.8)`, 1px `rgba(255,255,255,0.08)` border, `☰` glyph; opens the drawer (via `useDrawer().open()`).
- Title 22px / weight 800 / `colors.text`; subtitle 13px / `colors.textMuted`.
- Padding vertical 12, horizontal 20.
- **Super Admin (Plans)**: title `Plans`, subtitle `Create and manage membership plans.`, `right` = `+ Add Plan` accent pill → `openCreate()`. `source: SuperadminPlansScreen.tsx:425-433`.
- **Branch Admin (Plans)**: title `Plans`, subtitle `Membership plans available in your branch.`, **no `right` slot**. `source: AdminPlansScreen.tsx:102-105`.
- No back button on these screens (both are root stack screens reachable from the drawer).

---

## 7. PLAN CARD

### Super Admin card `source: SuperadminPlansScreen.tsx:335-419`
| Region | Content | Styling |
|---|---|---|
| Top row | Name (1 line, ellipsis), subtitle `{duration} days` on left; `₹{price.toLocaleString('en-IN')}` on right | name 17/700 text; duration 13 `textMuted`; price 18/800 **accent** |
| Features | If `features.length > 0`: first 3 rows `<✓ bullet> <text>`; `+N more` if >3 | bullet ✓ 13/700 **success** width 18; text 13 `textMuted`, 1 line; `+N more` 12 italic `textFaint`, marginLeft 18 |
| | Else: `No features listed` (italic 13 `textFaint`) | SA: no top border (marginBottom 10); Admin: borderTop 1px `rgba(255,255,255,0.06)` |
| Branches (SA only) | Pressable row → `openViewBranches(plan)`; label `AVAILABLE IN {n} BRANCH{ES}` (uppercase 12/600 `textMuted`, letterSpacing 0.5); if n>0: up to 3 chips of `branchCode` + `+{n-3}`; else `Not applied to any branch` (italic 13 `textFaint`) | borderTop 1px `rgba(255,255,255,0.06)`; chips bg `rgba(139,92,246,0.12)`, radius 8, text 12/600 **accent**; `+N` 12 `textFaint` |
| Actions (SA only) | `Apply to Branch` (primary), `Edit`, `Delete` | row `gap:8`, borderTop 1px; primary = flex1, bg `rgba(139,92,246,0.18)`, accent border, radius 10, text accent 13/700; Edit/Delete = `inputBackground` bg, `border` 1px, radius 10; Edit text `textMuted` 13/600; **Delete text `colors.danger` 13/700** |

### Branch Admin card `source: AdminPlansScreen.tsx:63-98, 210-302`
Same theme, differences:
- Has a **green availability pill**: dot 7px `success` + `Available in your branch` (12/600 success) on bg `rgba(46,184,114,0.12)`, border `rgba(46,184,114,0.35)`, radius 999, paddingH 10 / paddingV 4. `source: AdminPlansScreen.tsx:76-79, 243-266`.
- **No branches section, no actions row** — the card is informational only.
- Features: identical bullet list, but feature section has `borderTop` 1px when >0. `source: AdminPlansScreen.tsx:267-271`.

Card chrome (both): bg `rgba(30,32,44,0.6)`, border 1px `rgba(255,255,255,0.08)`, radius 16, padding 16, marginBottom 12.

---

## 8. ADD PLAN SCREEN

There is **no Add Plan screen** and **no separate Add Plan route**. Add Plan is a **modal** inside `SuperadminPlansScreen` (a `<Modal transparent animationType="slide">`), rendered when `formVisible === true`.

Trigger: header `+ Add Plan` → `openCreate()` → `setEditing(null); setForm(blankPlanForm()); setFormErrors({}); setFormVisible(true)`. `source: SuperadminPlansScreen.tsx:121-126, 429-432`.

Visible elements (in order): `source: SuperadminPlansScreen.tsx:479-604`
1. **Sheet**: bottom sheet — overlay `rgba(0,0,0,0.65)`, sheet bg `#13161d`, top radius **24**, paddingH 20, paddingTop 18, paddingBottom max(insets.bottom,28), maxHeight **88%**, inside `KeyboardAvoidingView` (iOS `padding`, Android `height`).
2. **Header row**: title `Add Plan` (18/800, flex1) + close ✕ (hitSlop 10).
3. **Scroll area** (`maxHeight: '70%'`):
   - `FormField "Plan Name *"` → TextInput, placeholder `e.g. Premium Monthly`, error variant (danger border).
   - Row (gap 12) of two half-fields:
     - `FormField "Price (₹) *"` → TextInput `keyboardType="numeric"`, placeholder `0`, sanitizes input to `[0-9.]`.
     - `FormField "Duration (days) *"` → TextInput `keyboardType="numeric"`, placeholder `30`, sanitizes to `[0-9]` only.
   - `FormField "Features"` (no asterisk, optional):
     - Input row: TextInput placeholder `Add a feature` (`returnKeyType="done"`, `onSubmitEditing={addFeature}`) + square `+` button (50×50, accent-tinted).
     - Tag list (if any): pill tags (radius 16, violet) each with feature text + ✕ remove.
4. **Actions row** (below scroll area): `Cancel` (outline, flex1, h50, radius 14) + `Create Plan` (accent bg, flex1, h50, radius 14). Submit disabled + opacity 0.6 while submitting; shows `ActivityIndicator` in place of label while submitting.

---

## 9. ADD PLAN FORM

`PlanFormValues { name, price: string, duration: string, features: string[], featureInput }`; `blankPlanForm()` = `{ name: '', price: '', duration: '30', features: [], featureInput: '' }`. `source: SuperadminPlansScreen.tsx:38-48`.

| Field | Control | Placeholder | Default | Required | Keyboard | Sanitization |
|---|---|---|---|---|---|---|
| Plan Name | `TextInput` (text) | `e.g. Premium Monthly` | `''` | Yes | default | none |
| Price | `TextInput` | `0` | `''` | Yes | numeric | strips `[^0-9.]` |
| Duration (days) | `TextInput` | `30` | `'30'` | Yes | numeric | strips `[^0-9]` (integers only) |
| Features | input + tag list | `Add a feature` | `[]` | No | default | trim; **dedupe** (`includes` check) |
| Branch selection | **Not present in the form** | — | — | — | — | (branch assignment is a separate Apply-to-Branch flow; see §16) |

**Lifecycle** `source: SuperadminPlansScreen.tsx:153-215`
1. Open (Add): form reset to blank; no branch/es field.
2. Enter values: `onChangeText` updates `form.*` and calls `clearError(field)` (error removed on edit).
3. Description feature input: `addFeature()` trims, ignores empty, ignores duplicates, appends and clears `featureInput`.
4. Validation runs **on submit only** (`validateForm` → `setFormErrors`), not on blur.
5. Submit (`handleSubmit`): if any error → return (errors shown under fields). Else `setSubmitting(true)`, build `{ name, price: Number, duration: Number, features: filtered non-empty }`, call `createPlan`, on success `Alert.alert('Plan created')`, `setFormVisible(false)`, `load('initial')` (full list refetch). On error `Alert.alert('Error', msg)`. `setSubmitting(false)` in `finally`.
6. **Duplicate-submission prevention**: submit/cancel disabled while `submitting`; inputs `editable={!submitting}`.
7. **Cancel / ✕ / onRequestClose**: simply `setFormVisible(false)` — **no unsaved-changes prompt, no reset needed** (state reset happens on next open via `openCreate`).
8. Keyboard: `KeyboardAvoidingView` wraps the modal (iOS `padding`, Android `height`).

---

## 10. ADD PLAN VALIDATION

Client (`SuperadminPlansScreen.tsx:135-151`), all evaluated **client-side on submit**:

| Condition | Error message | Where |
|---|---|---|
| `name` empty/whitespace | `Plan name is required.` | frontend (+ server 400 `Missing required fields: name, price, duration`) |
| `price` empty or `Number(price)` is NaN | `Price is required.` | frontend |
| `price < 0` | `Price cannot be negative.` | frontend; server independently rejects `price < 0` (400 `Invalid values for price or duration`) |
| `duration` empty or NaN | `Duration is required.` | frontend |
| `duration < 1` **or** not an integer | `Duration must be at least 1 day.` | frontend; server rejects `duration < 1` (same 400) |
| duplicate plan name | — (no client check) | **server only**: 409 `Plan "name" already exists` |

**Server create** (`plan.controller.js:10-32`): same three required fields; `name.trim()`; duplicate check via `Plan.findOne({gymId, name})` — message `Plan "X" already exists`, status **409**. `price`/`duration` type coercion is implicit to the schema (Numbers).

Client sanitization effectively prevents negative prices and non-integer durations before validation, but the checks still exist (defense in depth with the server).

---

## 11. ADD PLAN API

Client (`src/api/plans.ts:75-85`):

```
POST /plans
Auth: Bearer <accessToken>   (JSON body, Content-Type: application/json)
Request:
{ "name": string, "price": number, "duration": number, "features": string[] (optional) }

Response 201:
{ "success": true, "message": "Plan created", "data": PlanItem }
```

`PlanItem` from the actual server document: `{ _id, gymId, name, price, duration, features: string[], branchCode: string|null, createdAt, updatedAt, __v }` (note: create response has **no** `appliedBranches` — empty/none, since no PlanBranch rows exist yet).

Client behavior: throws `Error('The server returned an unexpected response.')` if `res.data` missing; network/HTTP errors surface as `ApiError` (message from server `message` field, sanitized to ≤200 chars) — `src/api/client.ts:44-91`. Roles: **`authorize("superadmin")`** at the route layer (`plan.routes.js:7`); all other roles → 403 `Forbidden: Insufficient permissions`.

---

## 12. EDIT PLAN SCREEN

No separate screen/route. Edit reuses the **same modal** as Add, driven by the `editing` state:

- Trigger: card `Edit` → `openEdit(plan)` → `setEditing(plan)`, `setForm(planToForm(plan))` (pre-fills from **the list item already in state — no refetch** of the plan), `setFormErrors({})`, `setFormVisible(true)`. `source: SuperadminPlansScreen.tsx:128-133, 400-406`.
- `planToForm` maps `name → name`, `price → String(price)`, `duration → String(duration)`, copies `features`, `featureInput: ''`. `source: 50-58`.
- Modal title switches to `Edit Plan`; submit label switches to `Save Changes`. `source: 491, 597`.
- **No branch editing in this form** — branch assignment is only managed via the Apply/Remove flow.
- Submit path (`handleSubmit` `editing` branch, lines 168-180): builds optional-field update payload `{ name, price, duration, features }` and calls `updatePlan(editing._id, updatePayload)`; success `Alert.alert('Plan updated')` → close + `load('initial')`; error `Alert.alert('Error', msg)`.
## 13. EDIT PLAN FORM

Same modal/layout as Add (§9). Table of Add-vs-Edit behavior:

| Field | Add | Edit | Notes |
|---|---|---|---|
| Plan Name | empty, required | pre-filled, editable | placeholder only shows when empty |
| Price (₹) | empty, required | pre-filled `String(price)`, editable | same sanitization |
| Duration (days) | default `'30'`, required | pre-filled, editable | same sanitization |
| Features | empty tag list | pre-filled from `plan.features` | add/remove identical; dedupe |
| Branch selection | **none** | **none** | never part of this form |
| Modal title | `Add Plan` | `Edit Plan` | `editing ? … : …` |
| Submit label | `Create Plan` | `Save Changes` | same handler, different branch |
| API | `POST /plans` | `PATCH /plans/:id` | EDIT uses `_id` from list item |
| Data source | blank form | **list item state** (no refetch) | `planToForm(plan)` |

Edit form validation = **identical** `validateForm` + the same server 400 checks (§10) plus server-only 404 handling.

Errors clear per-field on edit; feature tags have no error state.

---

## 14. EDIT PLAN VALIDATION

- Client: same rules as §10 (name/price/duration) — unchanged between modes.
- Server (`plan.controller.js:91-112`): update allows partial bodies. `price<0` → 400 `Price cannot be negative.`; `duration<1` → 400 `Duration must be at least 1 day.`; plan not found → 404 `Plan not found`; non-superadmin branch-ownership guard (unreachable via route) → 403.
- **No duplicate-name check on update** (create only). Renamning a plan to an existing name does not collide at schema level unless same `branchCode` (unique index `{gymId,name,branchCode}`; both null ⇒ potential collision triggers Mongo 11000 → surfaced as 500 unless handled; **flag in §38-Unknown**).

---

## 15. EDIT PLAN API

Client (`src/api/plans.ts:87-97`):

```
PATCH /plans/:planId
Auth: Bearer <accessToken>     (JSON body)
Request (partial):
{ "name"?: string, "price"?: number, "duration"?: number, "features"?: string[] }

Response 200:
{ "success": true, "message": "Plan updated", "data": PlanItem }
```

Notes:
- Method is **PATCH** (not PUT). Confirmed from route + client.
- Response `data` does **not** include `appliedBranches`; UI refetches the list after edit.
- Errors: 400 (invalid values), 403 (permission), 404 (not found). 409 name collision possible via unique index — **not explicitly mapped by the controller** (§38).
- Role: `authorize("superadmin")`.

---

## 16. APPLY TO BRANCH SCREEN

No route — an in-file modal (`branchModalVisible`). Full flow `source: SuperadminPlansScreen.tsx:245-282, 606-668`.

**Triggers**: card action `Apply to Branch` → `openBranchModal(plan)`:
1. `setBranchModalPlan(plan); setBranchModalVisible(true); setBranchesLoading(true)`
2. `getBranches()` (GET `/branches?limit=100`) and keeps **only `status === 'active'`** branches (`branches.filter(b => b.status === 'active')`).
3. On error: `Alert.alert('Error', 'Failed to load branches.')` and closes the modal.

**Modal contents** (`styles.branchRow`):
- Title: `Apply "{plan name}"` + ✕ close.
- Bodies:
  - while loading: spinner + `Loading branches...`
  - zero branches: `No active branches found.`
  - else: rows of `branch.name` (15/600) + `branch.branchCode` (13/700 accent); right side:
    - if `alreadyApplied` (code ∈ plan.appliedBranches): green `Applied` badge (bg `rgba(46,184,114,0.15)`, text 13/600 success) — **no button, not re-clickable; deselection NOT offered here**.
    - else: `Apply` button (accent bg, radius 10, minWidth 70) → `handleApply(branchCode)`.
- **No global Cancel/Submit**; each row acts immediately.

**After apply** (`handleApply`): sets `applyingBranch = branchCode` (row shows spinner, button disabled) → `applyPlanToBranch(planId, branchCode)` → success `Alert.alert('Applied', 'Plan applied to {CODE}.')`, close modal, `load('initial')`. Error: `Alert.alert('Error', msg)` (e.g. server 409 already applied).

**Remove path lives in the View-branches modal**: card branch-section press → `openViewBranches(plan)` → `getPlanBranches(planId)` (falls back to `plan.appliedBranches` on error) → rows show `branchCode` + status text (`active`/`inactive`, colored) + danger-outline `Remove` → `confirmRemoveBranch()` Alert → `removePlanFromBranch` → `Alert.alert('Removed', 'Plan removed from {CODE}.')` → refresh modal list + `load('initial')`.

---

## 17. BRANCH SELECTION LOGIC

- **Single-branch-per-click.** No multi-select, no checkboxes, no radio — each branch row is an independent `Apply` action.
- **Already-applied detection**: `appliedSet = new Set(branchModalPlan.appliedBranches)`. `source: 280-282, 635`.
- **Duplicate assignment prevention**: server 409 (`Plan is already applied to branch X`) AND the UI hides the Apply button for applied codes (shows `Applied` badge instead).
- **Disabled branches**: none shown (only `status==='active'` branches are fetched). Inactive branches are filtered out client-side.
- **Deselection**: not offered in the Apply modal — removal requires the separate **View branches** modal (Remove).
- **Select-all / min / max**: none.
- **Current branch**: not a concept here (this is superadmin-level; the admin sees only their own branch list and can't apply anyway).
- **Assignment semantics (critical for React.js)**: each call operates on **one branch** — apply adds/activates a single `PlanBranch` for one `planId+branchCode`. It never replaces the full set. Removal deletes a single row.

---

## 18. APPLY TO BRANCH API

Three endpoints, all under `protect` only at the route layer but **superadmin-gated inside the controller** `source: plan.routes.js:11-13`, `plan.controller.js:134-227`:

```
Apply:
POST /plans/:planId/branches
Body: { "branchCode": string }
→ 201 { success, message: "Plan applied to branch X", data: PlanBranch }
→ 409 "Plan is already applied to branch X"   (if active row exists)
→ 200 (if re-activating an existing inactive row; message same as applied)
→ 400 "branchCode is required" | 404 "Plan not found" | 404 "Branch "X" not found"
Roles: superadmin (else 403 "Only superadmin can apply plans to branches")

Remove:
DELETE /plans/:planId/branches
Body: { "branchCode": string }      (express.json parses DELETE body)
→ 200 { success, message: "Plan removed from branch X", data: {} }
→ 400 "Cannot remove plan: N active member(s) in X are using this plan" (N>0)
→ 404 "Plan is not applied to branch X" | 404 "Plan not found" | 400 "branchCode is required"
Roles: superadmin (else 403 "Only superadmin can remove plans from branches")

List:
GET /plans/:planId/branches
→ 200 { success, message: "Plan branches fetched", data: [PlanBranch, …] }  (active only, sorted by branchCode desc)
Roles: any authenticated user
```

`PlanBranch`: `{ _id, gymId, planId, branchCode, status: 'active'|'inactive', createdAt, updatedAt, __v }`.

**Apply/remove distinction** (assignment does **NOT replace all branches**, it **adds/activates one**; remove **hard-deletes** one → re-applying later creates a fresh row). `source: plan.controller.js:166-172, 212`.

---

## 19. DELETE PLAN FLOW

`source: SuperadminPlansScreen.tsx:219-243`

1. Card `Delete` → `confirmDelete(plan)`.
2. Native alert:
   - Title: `Delete plan`
   - Message: `Delete "{plan.name}"?\n\nThis will also remove all branch assignments. Cannot be undone.`
   - Buttons: `Cancel` (cancel style) / `Delete` (**destructive**).
3. On confirm → `deletePlan(plan._id)` (`DELETE /plans/:planId`) → `Alert.alert('Plan deleted')` → `load('initial')`.
4. On error → `Alert.alert('Error', msg)`.

Server (`plan.controller.js:114-132`):
- 404 `Plan not found`.
- **Guard**: `Member.countDocuments({ currentPlan: planId, gymId, status: 'active' }) > 0` → **400 `Cannot delete plan assigned to active members`** — plan cannot be deleted while any active member uses it.
- Deletes `PlanBranch.deleteMany({ planId, gymId })` then `plan.deleteOne()`. Response `{ success, message: 'Plan deleted', data: {} }`.
- Note: members with **non-active** status using the plan do NOT block deletion (their `currentPlan` ref is left dangling — §38 flag).
- No loading indicator on the delete button itself (native Alert blocks anyway); list refetch happens after.
## 20. ROLES & PERMISSIONS

Auth model: `protect` (Bearer JWT, `req.user`, blocks inactive users) + `authorize(...)` (superadmin bypass; role→permission map). `source: auth.middleware.js:6-74`.

| Role | View Plan list | Add | Edit | Delete | Apply/Remove Branch | View plan branches |
|---|---|---|---|---|---|---|
| **superadmin** | Yes (all plans) | Yes | Yes | Yes | Yes | Yes |
| **admin** (branch) | Yes — **only applied to own branch** (server-scoped) | **No** | **No** | **No** | **No** (403) | Yes (endpoint has no guard) |
| **trainer** | Server allows (branch-scoped); no admin UI | No | No | No | No (403) | Yes |
| **member** | Server allows (branch-scoped); used in member flows | No | No | No | No (403) | Yes |

Evidence:
- Routes: `GET /` no role guard (`plan.routes.js:6`); `POST`, `PATCH /:id`, `DELETE /:id` → `authorize("superadmin")` (`plan.routes.js:7-9`). Because `superadmin` has no entry in `rolePermissions`, `hasPermissions` is false and the check passes only via `hasRole === 'superadmin'`. **Admins cannot mutate plans through the API regardless of UI.**
- Controllers re-enforce: `applyPlanToBranch`/`removePlanFromBranch` hard-403 non-superadmins (`plan.controller.js:135-137, 176-178`).
- Frontend guards: **none beyond role-gated routing** — the Admin drawer routes to `AdminPlans` (read-only) and the Superadmin drawer routes to `SuperadminPlans` (full). There is no permission gate inside either screen.
- `updatePlan`/`deletePlan` still contain dead non-superadmin branch-ownership checks (`plan.controller.js:99-103, 118-122`) — unreachable because the route blocks non-superadmins.

Admin role permissions that include `manage_plans` do **not** grant plan mutations because the route only accepts the literal role `superadmin` (`hasRole`), not the permission string. `source: auth.middleware.js:49-72`.

---

## 21. BRANCH-SCOPED BEHAVIOR

### Super Admin
- `listPlans()` called **with no filter** → `GET /plans?limit=100` → sees **all plans** (any `branchCode`/`appliedBranches`), sorted newest-first.
- Can apply/remove branches, edit/delete any plan, see every branch in the apply modal (`getBranches()` all, filtered to active).
- Card shows branch chips + `Apply to Branch` actions.

### Branch Admin
- `listPlans({ branchCode: user.branchCode })` → server **ignores** the passed `branchCode` for non-superadmins and uses `req.user.branchCode` (fallback `MAIN`) — `plan.controller.js:38-45`. (The client param is redundant but harmless.)
- The controller restricts to plans with an active `PlanBranch` row for the user's branch: `PlanBranch.distinct('planId', { gymId, branchCode: userBranch, status:'active' })`, `query._id = {$in: appliedPlanIds}`.
- Result: admin sees **only plans applied to their branch** — a freshly created (unapplied) plan is invisible to admins.
- Card shows the green `Available in your branch` pill; **no actions** (no apply since they can't, no edit/delete).
- Remote: the apply modal never opens; `SuperadminPlansScreen` is never rendered for admins (routing gate).

### Branch-scoping logic (source of truth)
- Superadmin: optional `query.branchCode` (skips `ALL`/`all`). `exact=true` → only applied plans; default (`exact` unset) → `branchCode: null` **OR** `branchCode: 'ALL'` **OR** applied to that branch. `source: plan.controller.js:46-62`. (The RN app never sends `branchCode` or `exact` for superadmin.)
- Non-superadmin: forced to own branch, applied-only (`plan.controller.js:38-45`).

---

## 22. NAVIGATION & ROUTES

- Routes in `AppStackParamList` (both `undefined` params): `SuperadminPlans`, `AdminPlans`. `source: navigation/types.ts:10,16`.
- Registration: superadmin stack (`navigation/index.tsx:71`), admin stack (`:83`).
- Drawer entries: `{ key: 'Plans', label: 'Plans', icon: '▧', route: 'SuperadminPlans' }` / `{ key: 'Plans', label: 'Plans', icon: '▧', route: 'AdminPlans' }`. `source: SuperadminDrawer.tsx:33`, `AdminDrawer.tsx:31`.
- Both screens call `setActive('Plans')` on mount → highlights the drawer item and closes the drawer. `source: both screens useEffect`.
- **There are NO routes for Add/Edit/Apply/View-Branches/Delete** — all are inline modals within `SuperadminPlansScreen`. Navigation within the Plans feature = local React state toggling `<Modal visible>`.
- Back behavior: only the drawer/offering doesn't push anything; closing modals uses ✕ / Cancel / `onRequestClose` (Android back).

---

## 23. STATE MANAGEMENT

Plain **local React state** (`useState`/`useCallback`/`useMemo`). No Redux/Zustand/React Query/Context for plans. `source: SuperadminPlansScreen.tsx:72-96`, `AdminPlansScreen.tsx:36-39`.

Superadmin state:
- `plans: PlanItem[]`, `loading`, `refreshing`, `error` — list.
- `formVisible`, `editing: PlanItem|null`, `form: PlanFormValues`, `formErrors`, `submitting` — form modal.
- `branchModalVisible`, `branchModalPlan`, `branches`, `branchesLoading`, `applyingBranch` — apply modal.
- `viewBranchesVisible`, `viewBranchesPlan`, `planBranches`, `planBranchesLoading`, `removingBranch` — view/remove modal.
- `appliedSet` memo (`useMemo`) derived from `branchModalPlan.appliedBranches`.

Admin state: `plans`, `loading`, `refreshing`, `error` only.

Persistence/refresh: every mutation (create/edit/delete/apply/remove) ends with `load('initial')` (full refetch). Pull-to-refresh via `RefreshControl` → `load('refresh')`. No cache, no optimistic updates.

---

## 24. DATA MODELS

### Plan (server, `plan.model.js`) — CONFIRMED
| Field | Type | Rules |
|---|---|---|
| `_id` | ObjectId | |
| `gymId` | String | required, indexed |
| `name` | String | required, `trim` |
| `price` | Number | required, `min: 0` |
| `duration` | Number | required, `min: 1` — **days** |
| `features` | [String] | optional |
| `branchCode` | String | `default: null, trim, uppercase`, indexed — **legacy single-branch field (unused by create; `null` or `"ALL"` or code)** |
| `createdAt`/`updatedAt` | Date | timestamps |
| unique index | | `{ gymId: 1, name: 1, branchCode: 1 }` |

### PlanBranch (server, `planBranch.model.js`) — CONFIRMED (the real M:N)
| Field | Type | Rules |
|---|---|---|
| `_id` | ObjectId | |
| `gymId` | String | required, indexed |
| `planId` | ObjectId ref Plan | required, indexed |
| `branchCode` | String | required, `trim`, `uppercase` |
| `status` | String | enum `['active','inactive']`, default `'active'`, indexed |
| timestamps | | unique index `{gymId, planId, branchCode}` |

### Branch (server, `generic.model.js`) — CONFIRMED
`gymId`, `name` (required, trim), `branchCode` (default `MAIN`, uppercase), `description`, `address`, `phone`, `email`, `manager` (ref User), `status` enum `active|inactive` default `active`, `metadata`; unique `{gymId, branchCode}`.

### Client PlanItem (`src/api/plans.ts:3-14`) — CONFIRMED
`{ _id, gymId, name, price, duration, features: string[], branchCode: string|null, appliedBranches: string[], createdAt, __v }` — note `appliedBranches` is **server-attached on list responses only** (computed client-side absence on create/update responses). `branchCode` in the client type is the legacy field.

### Member relation (used in guards) — CONFIRMED
`Member.currentPlan: ObjectId ref Plan`; delete blocked when a member with `status:'active'` references the plan (`member.controller.js:124` in deletePlan).
## 25. COMPLETE API MAP

All responses wrapped: `{ success: boolean, message: string, data: any }`; errors: `{ success:false, message, code, data }` (`error.middleware.js`). Auth: `Authorization: Bearer <accessToken>` on every call. Rate limit: 300 req / 15 min/IP (skipped for `/api/scanners`). Base: `API_BASE_URL` (default `EXPO_PUBLIC_API_URL`).

| Operation | Method | Endpoint | Request | Response `data` | Role |
|---|---|---|---|---|---|
| List plans | GET | `/api/plans?limit=100` (`search`?, `branchCode`?, `exact`?, `page`?) | — | `{ items: PlanItem[] (with appliedBranches), total, page, limit }` | any authenticated; non-SA scoped to own branch |
| Create plan | POST | `/api/plans` | `{ name, price, duration, features? }` | `PlanItem` (no appliedBranches) | superadmin |
| Update plan | PATCH | `/api/plans/:id` | partial `{ name?, price?, duration?, features? }` | `PlanItem` (no appliedBranches) | superadmin |
| Delete plan | DELETE | `/api/plans/:id` | — | `{}` | superadmin (blocked if active members) |
| Get branches | GET | `/api/branches?limit=100` | — | `{ items: BranchItem[], total, page, limit }` | authenticated; non-SA sees own branch only |
| Apply plan to branch | POST | `/api/plans/:planId/branches` | `{ branchCode }` | `PlanBranch` | superadmin (controller-enforced) |
| Remove plan from branch | DELETE | `/api/plans/:planId/branches` | `{ branchCode }` | `{}` | superadmin (controller-enforced) |
| List plan branches | GET | `/api/plans/:planId/branches` | — | `PlanBranch[]` (active only, sorted) | any authenticated |

HTTP/error specifics from the client (`client.ts`): 401 → auto refresh-and-retry once, else logout; 403/404/5xx → mapped to friendly `ApiError.message` (server `message` used if present and ≤200 chars); network failure → `Network unavailable. Please check your connection and try again.`; `400` generic → `The request was invalid. Please check your details.`

---

## 26. LOADING / EMPTY / ERROR STATES

Both screens share the same pattern (`loading ? spinner : error ? retry : list`). `source: SuperadminPlansScreen.tsx:435-476`, `AdminPlansScreen.tsx:107-144`.

### Super Admin
| State | UI | Copy |
|---|---|---|
| Loading (initial) | centered `ActivityIndicator` (accent, large) + text | `Loading plans...` |
| Error | centered ⚠ (36px, `textFaint`) + message (14, `textMuted`, centered, lineHeight 20) + `Retry` button (accent bg, paddingH 28 / paddingV 12, radius 12, text 15/700) | error message from `messageFrom(err, 'Failed to load plans. Please try again.')` |
| Empty | centered: ⚡ (48px) + title + subtitle + `Add First Plan` button (accent, same as Retry) | `No plans created yet` / `Plans must be created before they can be applied to branches.` |
| Refreshing | `FlatList` `RefreshControl` (tint/colors accent) | — |
| Submitting (form) | submit button shows `ActivityIndicator`; button + inputs disabled; Cancel disabled | — |
| Validation errors | per-field danger text under inputs + danger border on inputs | see §10 |

### Branch Admin
Same states with different copy:
- Error: `messageFrom(err, 'Failed to load plans. Please try again.')` + Retry (identical styling).
- Empty: ⚡ `No plans available yet` / `Contact the superadmin to apply membership plans to your branch.` (`paddingTop: 80`).
- **No submitting state** (read-only screen).

### Modals (inside Super Admin screen)
- Apply modal: `Loading branches...` spinner; `No active branches found.`; per-row `Applied` badge / spinner / `Apply`.
- View branches modal: spinner; `This plan is not applied to any branch.`; per-row `Remove` spinner while removing.
- Form modal errors: field-level (§10); server 409 shows in `Alert.alert('Error', 'Plan "X" already exists')`.

---

## 27. TOASTS / ALERTS / FEEDBACK

All feedback in the Plans feature uses **native `Alert.alert`** (no custom toast system in this feature — unlike Members which uses an animated inline toast).

| Trigger | Alert | Buttons | Effect |
|---|---|---|---|
| Create success | `Plan created` (title only) | OK | close modal, reload |
| Update success | `Plan updated` | OK | close modal, reload |
| Delete confirm | title `Delete plan`, msg `Delete "{name}"?\n\nThis will also remove all branch assignments. Cannot be undone.` | `Cancel` / `Delete` (**destructive**) | delete + reload |
| Delete success | `Plan deleted` | OK | reload |
| Delete error | title `Error`, msg | OK | stays |
| Apply success | title `Applied`, msg `Plan applied to {CODE}.` | OK | close modal, reload |
| Apply error | title `Error`, msg (incl. server 409 duplicate) | OK | row resets |
| Load-branches error | title `Error`, msg `Failed to load branches.` | OK | modal closes |
| Remove confirm | title `Remove from branch`, msg `Remove this plan from {CODE}?` | `Cancel` / `Remove` (**destructive**) | remove + reload |
| Remove success | title `Removed`, msg `Plan removed from {CODE}.` | OK | refresh modal + reload |
| Remove error | title `Error`, msg (incl. 400 active-members) | OK | row resets |

`Alert.alert` on web cannot be used directly — the React.js build must replace all of the above with its own confirm/message dialogs (blueprint in §34).

---

## 28. RESPONSIVE / DEVICE BEHAVIOR

- **No breakpoints** — RN single-column layouts.
- Cards: fixed metrics; name/feature text `numberOfLines={1}` (ellipsis) protects layout from long strings; branch chips wrap (`flexWrap: 'wrap'`, `gap: 6`).
- Price column: `flex-start` aligned right of a `flex:1` name block; long prices (`₹1,00,000`) shrink the name block (flex), price does **not** wrap (single line).
- Form modal: `maxHeight: '88%'` sheet, scroll area `maxHeight: '70%'`; `KeyboardAvoidingView` (iOS `padding`, Android `height`); bottom padding `Math.max(insets.bottom, 28)` so the actions row clears home indicator/keyboard.
- Apply/View modals: sheet `maxHeight: '88%'`; scroll area `maxHeight: '70%'`; no keyboard (no inputs) so `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`.
- Landscape/tablet: no special handling; sheet still anchored to bottom; content scrolls; branch list grows vertically.
- **React.js guidance**: honor these limits with responsive equivalents (max-width card column, `overflow-y` scroll modal with `max-height ~88vh`, sticky header/actions, keyboard-avoiding via scroll; clamp to 1 line with ellipsis for name/features; wrap chips; right-align price with `shrink:{0}`).
## 29. SCREENSHOT vs RN COMPARISON

> **Verification status: NOT VERIFIED / PARTIAL.** No screenshot image was found in the workspace (searched every `*.png|jpg|jpeg|webp`; only `assets/` app icons exist). This table compares the prompt's **textual** description of the Plans UI against the RN source.

| Element | Screenshot (textual description) | RN Source | Match |
|---|---|---|---|
| Plans list screen | Plans list with cards | `SuperadminPlansScreen` FlatList | Consistent |
| Header + subtitle | Header title + subtitle | `SuperadminHeader` "Create and manage membership plans." | Consistent |
| Add Plan | Header button on right | `+ Add Plan` accent pill (SA only) | Consistent |
| Plan card: name, duration, price | Card top row | name 17/700, `{d} days`, `₹{en-IN price}` 18/800 accent | Consistent |
| Plan card: features | Feature bullets | ✓ bullets (max 3 + `+N more`) | Consistent |
| Plan card: branch availability | Branch chips/label | `AVAILABLE IN N BRANCHES` + chips; admin card uses green `Available in your branch` pill | Consistent (two variants) |
| Actions (Apply/Edit/Delete) | Action buttons on card | `Apply to Branch` + `Edit` + `Delete` (SA only) | Consistent |
| Add/Edit modal | Bottom sheet with fields | slide Modal: Name / Price(₹) / Duration / Features tag list | Consistent |
| Branch apply modal | Branch list, per-branch Apply | rows name+code with `Applied` badge or `Apply` | Consistent |

All listed UI elements exist in source. Pixel-level spacing/color cannot be verified without the asset (disclosed §38).

---

## 30. DESIGN SYSTEM

Tokens (`src/theme/colors.ts`) used across the feature:
- `background #0B0E11` (screens use `#0a0b10`), `surface #151A20`, `surfaceAlt #1C232B`, `border #2A333D`, `primary #E11D2E`, `primaryDark #B81625`, **`accent #8b5cf6`** (brand purple — all primary CTAs, price, chips), `text #FFFFFF`, `textMuted #9AA7B4`, `textFaint #6B7785`, `danger #E5484D` (delete/remove), `success #2EB872` (✓ / available / Applied), `inputBackground #14181E`.

Hard-coded values in Plans styles: screen bg `#0a0b10`; card bg `rgba(30,32,44,0.6)` + border `rgba(255,255,255,0.08)`; sheet bg `#13161d`; overlay `rgba(0,0,0,0.65)`; dividers `rgba(255,255,255,0.06)`.

Typography: title 22/800; subtitle 13; card name 17/700; price 18/800; duration 13; feature text 13; branch label 12/600 uppercase letterSpacing 0.5; feature `+N` 12 italic; input 15; labels 13/600; error 12; button labels 13-15/700.

Spacing: gutters 20; card padding 16; card gap 12; radius: cards 16, inputs 12, buttons/actions 10-14, chips 8-16, pills 999; heights: inputs 50, buttons 50, feature-add 50.

Shadows/elevation: **none** in the feature (flat design; drawer/hamburger uses subtle rgba borders only).

Buttons: primary (accent bg), outline (border 1px), destructive-text (danger), tinted-inline (`rgba(139,92,246,0.18)` + accent border). Icons are **unicode glyphs** (`+`, `✕`, `✓`, `⚠`, `⚡`, `₹`, hamburger `☰`), not an icon library.

---

## 31. SHARED COMPONENTS

| Component | File | Props | Purpose in Plans | Notes for React.js |
|---|---|---|---|---|
| `SuperadminHeader` | `src/components/SuperadminHeader.tsx` | `title`, `subtitle`, `right?`, optional back | Header of both Plans screens; `right` = Add button | Replace with a `PageHeader` (title/subtitle/slot) |
| `StatusBadge` | `src/components/StatusBadge.tsx` | status → colored pill | Not used by Plans | n/a |
| `SuperadminDrawer` / `AdminDrawer` / `RoleDrawerHost` | `src/components/drawer/*` | items list, active key | Nav entry `Plans ▧` | Replace with sidebar/nav with active-item highlight |
| `DrawerContext` | `DrawerContext.tsx` | `DrawerKey`, `activeKey`, `open/close/setActive` | `setActive('Plans')` | Replace with router active-link state |
| `FormField` (local) | inside `SuperadminPlansScreen.tsx:736-752` | `label`, `error?`, children | Form field wrapper | Promote to shared `FormField` (label + error slot) |
| `SafeAreaView` + `RefreshControl` | react-native + safe-area-context | | Padding + pull-to-refresh | Replace RefreshControl with manual refresh button or SWR revalidate |

**Feature-local (duplicated within screens, worth extracting for React.js):** `renderPlanCard` (two near-identical implementations), `formatPrice` (`toLocaleString('en-IN')`; SA also prefixes `₹`), `messageFrom`.

No third-party UI library is used anywhere in the RN app for these screens (no icons, no date pickers, no form libs).

---

## 32. BUSINESS RULES

Confirmed from source (`plan.controller.js`, screens):

1. **Plan uniqueness**: name is unique per gym on create (409 `Plan "X" already exists`). Schema adds `{gymId,name,branchCode}` uniqueness — update path relies on schema only (§38).
2. **Price**: cannot be negative (client + server). Server `min:0` schema.
3. **Duration**: integer ≥ 1 day (client + server). Client strips non-digits; still validates integer.
4. **Features**: optional, unlimited length list; each trimmed; client de-duplicates on add; server does not de-duplicate.
5. **Creation defaults**: `status` has no member-set concept — created plans are **immediately visible to the creator (superadmin) but not to any branch admin until applied**. Legacy `branchCode` is not set on create (defaults `null`); legacy `"ALL"` value (if ever used) makes a plan visible to non-superadmin + branch filters as "available everywhere" via the `$or` branch in listPlans (`plan.controller.js:56-61`).
6. **Apply = add-one/activate-one**; does not replace the branch set; duplicates → 409; re-applying an `inactive` row reactivates it (200).
7. **Remove = hard-delete-one**; blocked (400) when ≥1 **active** member in that branch uses the plan.
8. **Delete = hard-delete plan + all its PlanBranch rows**; blocked (400) when ≥1 **active** member (any branch) uses the plan.
9. **Non-active members referencing a plan do not block delete** — their refs are left as dangling `currentPlan` (§38 flag, mirrored behavior not confirmed).
10. **Inactive branches (Branch.status !== 'active') are filtered out** of the Apply modal (client-side) and cannot receive applications from the UI (though the API itself only checks the branch exists — §38).
11. **Branch-admin visibility** = only plans applied (active) to their own branch; legacy `null`/`ALL` plans are **excluded** for admins (must be explicitly applied).
12. **Superadmin list** shows all plans regardless of application state (**unlike** members, there is no pending-approval status for plans).

---

## 33. COMPLETE USER FLOWS

### FLOW 1 — VIEW PLANS (Super Admin)
```
Login (superadmin) → RoleDrawerHost → SuperadminDrawer
 → tap Plans ▧ → navigation.navigate('SuperadminPlans')
 → screen mounts: setActive('Plans')
 → load('initial'): setLoading(true) → GET /plans?limit=100 → plans=items → render
   (loading spinner → if error: ⚠ + Retry → reload; if empty: ⚡ + Add First Plan)
Pulled-to-refresh → GET /plans → refresh
```

### FLOW 2 — VIEW PLANS (Branch Admin)
```
Login (admin) → AdminDrawer → tap Plans ▧ → AdminPlans
 → GET /plans?branchCode=<user.branch>&limit=100 (server ignores branch for non-SA; scopes to own)
 → cards show "Available in your branch" pill only; no actions
Empty state: "Contact the superadmin to apply membership plans to your branch."
```

### FLOW 3 — ADD PLAN
```
Plans → + Add Plan → openCreate() (reset form) → modal slides up
 → fill Name / Price / Duration / features (optional)
 → submit → validateForm() → errors under fields (stop if any)
 → setSubmitting → POST /plans → 201 → Alert('Plan created') → close modal
 → load('initial') → new plan visible (to superadmin); NOT yet visible to admins
On 409/4xx/5xx → Alert('Error', msg) → form stays open, values preserved
```

### FLOW 4 — EDIT PLAN
```
Plans → Edit on card → openEdit(plan) (pre-fill from list item, NO refetch)
 → modify → submit → validate → PATCH /plans/:id → 200 → Alert('Plan updated')
 → close → load('initial')
On error → Alert('Error', msg) → form stays open
```

### FLOW 5 — APPLY TO BRANCH
```
Plans → Apply to Branch → openBranchModal(plan)
 → GET /branches?limit=100 → filter status==='active'
 → for each branch: already applied? → green "Applied" badge
                        else → Apply → POST /plans/:id/branches {branchCode}
 → 201 → Alert('Applied', 'Plan applied to CODE.') → close modal → load('initial')
On 409 duplicate → Alert('Error', 'Plan is already applied to branch X') → row stays
```

### FLOW 6 — VIEW / REMOVE PLAN BRANCHES
```
Plans → tap card branch section → openViewBranches(plan)
 → GET /plans/:id/branches (fallback: plan.appliedBranches)
 → rows of branchCode + status + Remove
 → Remove → Alert('Remove from branch', 'Remove this plan from CODE?') → Confirm
 → DELETE /plans/:id/branches {branchCode}
 → 200 → Alert('Removed') → refresh modal rows + load('initial')
On 400 active-members → Alert('Error', 'Cannot remove plan: N active member(s) in X are using this plan')
```

### FLOW 7 — DELETE PLAN
```
Plans → Delete on card → Alert('Delete plan', 'Delete "name"? … Cannot be undone.', [Cancel, Delete])
 → Confirm → DELETE /plans/:id
 → 200 → Alert('Plan deleted') → load('initial')
On 400 active-members → Alert('Error', 'Cannot delete plan assigned to active members')
```
## 34. REACT.JS COMPONENT BLUEPRINT

Blueprint only — derived from actual RN structure. UI stays in one feature folder.

```
src/features/plans/
├── PlansPage.tsx                     (role-aware: superadmin → full CRUD; admin → read-only)
│   ├── <PageHeader title="Plans" subtitle={role subtitle} right={<AddPlanButton/> (SA only)}/>
│   ├── loading ? <Loader text="Loading plans..."/>
│   ├── error   ? <ErrorState ⚠ msg <Retry/>/>
│   ├── <PlansList>                    (data table|cards)
│   │   └── <PlanCard plan actions=…/>
│   │       ├── <PlanHeader name="{n} days" price="₹{en-IN}"/>
│   │       ├── <FeatureList features first3 +N more | "No features listed"/>   (shared w/ Admin)
│   │       ├── SA: <BranchAvailability appliedBranches onOpen={→ ViewBranches}/>
│   │       │       else Admin: <AvailablePill "Available in your branch"/>
│   │       └── SA: <PlanActions onApply onEdit onDelete/>  (Apply|Edit|Delete)
│   └── <PlanFormModal editing={plan|null} onSaved={reload}>
│       ├── <FormField name> <PriceField> <DurationField> (side by side)
│       ├── <FeatureTagsInput>  (input + add + removable tags)
│       └── <ModalActions Cancel|Create|SaveChanges spinner-while-submitting/>
├── ApplyToBranchModal.tsx
│   ├── <BranchRow name code> {applied ? <AppliedBadge/> : <ApplyButton spinner/>}
│   └── empty: "No active branches found."
├── ViewBranchesModal.tsx            (list + Remove + confirm)
├── DeletePlanDialog.tsx             (Alert → 2-button destructive dialog)
├── plansApi.ts                      (typed wrappers → tokens/Bearer)
├── types.ts                         (PlanItem, PlanBranch, PlanPage, payloads)
└── __tests__ …
```

Replacement notes:
- `RefreshControl` → manual refresh button / revalidate.
- `Alert.alert` → theme-aware dialog/toast component (messages/text from §27).
- `KeyboardAvoidingView` → scrollable form with `max-height: 88vh`, sticky action row.
- Role gating via auth of the web app (superadmin vs admin), mirroring RN routing.

---

## 35. REACT.JS DATA CONTRACTS

### Confirmed API contract (from server)
```
Success    → { success: true,  message: string, data: T }
Error      → { success: false, message: string, code?: string, data?: any }   (status from err.statusCode)
PlanItem   → { _id, gymId, name, price, duration, features: string[],
               branchCode: string|null, createdAt: string, updatedAt: string, __v }
            + list-only: appliedBranches: string[]  (server-attached)
PlanBranch → { _id, gymId, planId, branchCode, status: 'active'|'inactive', createdAt, updatedAt, __v }
PlanPage   → { items: PlanItem[], total: number, page: number, limit: number }
BranchItem(from /branches) → { _id, name, branchCode, address?, phone?, email?, status: string, … }
Create     → { name, price, duration, features? }        → POST   /api/plans
Update     → { name?, price?, duration?, features? }      → PATCH  /api/plans/:id
Apply      → { branchCode }                              → POST   /api/plans/:id/branches
Remove     → { branchCode }                              → DELETE /api/plans/:id/branches
```

### Frontend assumptions (must be assertive, guarded)
- `appliedBranches` may be absent on create/update responses → always refetch the list (do not merge partial payloads).
- Price is `number` (display via `toLocaleString('en-IN')`, prefix `₹`).
- `duration` is always integer days (server stores number; sanitize input to digits).
- `branchCode` on PlanItem is the **legacy** field — do not use it for branch-availability UI; use `appliedBranches` / `GET /plans/:id/branches`.
- Branch rows order from `GET /branches` is by `name` (server `.sort({name:1})`).

---

## 36. REACT.JS DUMMY DATA

> **DEVELOPMENT ONLY — NOT PRODUCTION DATA.** Shapes match the confirmed contracts for offline development.

```ts
// types.ts (dummy)
export const MOCK_PLANS: PlanItem[] = [
  // normal plan, applied to two branches
  { _id: 'p1', gymId: 'MAIN', name: 'Premium Monthly', price: 1500, duration: 30,
    features: ['Full gym access', '1 trainer session / wk', 'Locker', 'Free t-shirt'],
    branchCode: null, appliedBranches: ['MAIN', 'DELHI'], createdAt: '2026-01-01T00:00:00Z', __v: 0 },
  // plan with no features, unassigned
  { _id: 'p2', gymId: 'MAIN', name: 'Basic', price: 800, duration: 30,
    features: [], branchCode: null, appliedBranches: [], createdAt: '2026-01-02T00:00:00Z', __v: 0 },
  // plan with a single feature, assigned to one branch
  { _id: 'p3', gymId: 'MAIN', name: 'Morning Saver', price: 600, duration: 30,
    features: ['5 AM - 11 AM access'], branchCode: null, appliedBranches: ['MAIN'],
    createdAt: '2026-01-03T00:00:00Z', __v: 0 },
  // quarterly, >3 features, three+ branches (tests "+N more" and "+N")
  { _id: 'p4', gymId: 'MAIN', name: 'Annual Gold', price: 12000, duration: 365,
    features: ['Full gym access','Steam & sauna','Personal training','Diet plan','Towel service','Priority support'],
    branchCode: null, appliedBranches: ['MAIN','DELHI','NOIDA','GURUGRAM'], createdAt: '2026-01-04T00:00:00Z', __v: 0 },
];

export const MOCK_BRANCHES: BranchItem[] = [
  { _id: 'b1', name: 'India Gate', branchCode: 'MAIN', status: 'active' },
  { _id: 'b2', name: 'Connaught Place', branchCode: 'DELHI', status: 'active' },
  { _id: 'b3', name: 'Sector 62', branchCode: 'NOIDA', status: 'inactive' },
];

// Dev-only helpers
export const MOCK_FLOWS = {
  loading:  () => new Promise<PlanPage>(resolve => setTimeout(() => resolve({ items: MOCK_PLANS, total: 4, page: 1, limit: 100 }), 1200)),
  empty:    () => Promise.resolve({ items: [], total: 0, page: 1, limit: 100 }),
  error:    () => Promise.reject(new Error('Failed to load plans. Please try again.')),
};
```

Imports `PlanItem`, `PlanPage`, `BranchItem` from the feature types. Replace `MOCK_*` with the real `plansApi` during integration.

---

## 37. RECOMMENDED IMPLEMENTATION ORDER

1. Theme / design tokens (`colors`, spacing, radius, type scale) mirroring §30.
2. Shared primitives: `PageHeader` (title/subtitle/slot), `Spinner`, `ErrorState` (⚠+Retry), `EmptyState` (⚡+CTA), `FormField` (label+error), `ConfirmDialog`, `Toast`.
3. `types.ts` + `plansApi.ts` (typed wrappers; bearer token; refresh-retry strategy like `client.ts`).
4. `PlansPage` + `PlansList` + `PlanCard` (superadmin variant first) with dummy data.
5. Read-only Admin variant (pill + no actions) driven by the same `PlanCard`/flag.
6. `PlanFormModal` (add) → validation messages from §10.
7. Edit mode (same modal, `editing` prop, `PATCH`).
8. `DeletePlanDialog` (message/buttons from §19).
9. `ApplyToBranchModal` (branch list, `Applied` badges, per-row state).
10. `ViewBranchesModal` (list + status + remove-with-confirm).
11. Routing + role guards (SA vs admin routes) mirroring §22.
12. Wire real API + error/loading states (§25, §26).
13. Responsive polish (tablet/desktop column widths, long-name clamps, modal max-height, keyboard scroll) per §28.
14. Business-rule edge cases: 409 duplicate, 400 active-members guards, refetch-after-mutation.

---

## 38. CONFIRMED / INFERRED / UNKNOWN FINDINGS

**CONFIRMED (source-verified)**
- Two screens (SA full CRUD in one file; Admin read-only); all add/edit/apply/delete are inline modals/alerts, no extra routes.
- API map (§25), route guards, plan/planBranch schemas, business rules (§32).
- Human-copy strings for every alert/state (§26-27).
- `PATCH` (not PUT) for update; `DELETE /plans/:id` sends no body; apply/remove use DELETE with JSON body.

**INFERRED (consistent but not directly shown)**
- Server `appliedBranches` is only attached on `listPlans` → UI refetch design (create/update responses lack it).
- `exact=true` / legacy `branchCode:'ALL'` behavior exists server-side but is **unused by the RN app**.
- Inactive-plan `PlanBranch.status` rows are never created by this UI (apply always active; remove hard-deletes, so `inactive` rows only arise from manual DB ops or legacy data).

**UNKNOWN / FLAGGED**
- Screenshot image absent → §29 comparison unverified.
- `updatePlan` has no duplicate-name guard — renaming to an existing `{gymId,name,branchCode=null}` name may hit the unique index → undetermined 500 vs 409 handling (§14).
- Non-active members referencing a deleted plan are left with a dangling `currentPlan` ref (no cleanup found).
- Apply-modal filters branches client-side by `status==='active'`, but the **API only checks branch existence** — a caller could apply to an inactive branch via raw API.
- Whether `GET /plans` is used by the member app (and any rate/UX implications) — outside audit.
- Pagination: lists use `limit:100` but the UI does not expose `page` controls; beyond 100 plans behavior unverified.

---

## 39. REACT.JS IMPLEMENTATION CHECKLIST

- [ ] Plans list matches RN (header, cards, price/duration/features/branches, action row) — §5-7
- [ ] SA-only `+ Add Plan`, `Apply to Branch`, `Edit`, `Delete` — §8,12,16,19
- [ ] Admin read-only screen (pill `Available in your branch`) — §7
- [ ] Add modal: fields, defaults (`duration:30`), sanitization, validation messages — §8-10
- [ ] Add API: `POST /api/plans`, 201 handling, `Alert('Plan created')` replaced by dialog/toast, refetch — §11
- [ ] Edit modal reuses Add; pre-fill from list item (no refetch); `PATCH /api/plans/:id` — §12-15
- [ ] Apply-to-branch: active branches only, `Applied` badge, per-row spinner, `POST /:id/branches` — §16-18
- [ ] View/remove branches modal with confirm + status colors — §16
- [ ] Delete confirm dialog (destructive) + `DELETE /api/plans/:id` + reload — §19
- [ ] Role gating (superadmin vs admin) matching §20; api client reuses `client.ts` refresh logic — §20,25
- [ ] Loading / error / empty / refreshing / submitting states with exact copy — §26
- [ ] All alerts/toasts mapped to web dialogs with the same copy — §27
- [ ] Responsive: mobile, tablet, desktop; long names/prices; modal scroll + keyboard — §28
- [ ] Dummy data for offline development — §36
- [ ] No implementation was performed in the RN project (this audit only).

---

## 40. DEFINITION OF DONE

The React.js Plans implementation is complete when **all** of the following are true:

### Plans List
- [ ] UI matches reference (header, cards) and RN screenshots/tokens
- [ ] Cards match: name/duration/price formatting (`₹` + en-IN), features (3 + `+N more`), branch chips
- [ ] SA actions row (Apply/Edit/Delete) present only for superadmin; admin cards read-only + availability pill
- [ ] Branch availability (chips / pill / `Not applied` / `+N`) matches RN
- [ ] Pull-to-refresh replaced with working refresh; list refetches after every mutation

### Add Plan
- [ ] Form matches RN (Title `Add Plan`, fields Name/Price₹/Duration/Features, defaults `duration 30`)
- [ ] Validation matches RN messages (§10) and runs on submit; errors clear on edit
- [ ] Loading (submitting spinner, disabled controls) matches
- [ ] Success behavior: dialog `Plan created`, close, refetch — matches
- [ ] Server errors surfaced: 409 duplicate, 400 invalid values

### Edit Plan
- [ ] Existing data loads from list item without refetch; fields pre-filled
- [ ] `PATCH` used; title `Edit Plan`, button `Save Changes`
- [ ] Validation matches; update behavior matches RN (refetch after success)

### Apply to Branch
- [ ] Branch list = active branches only; rows name+code; loading state
- [ ] Already-applied branches show `Applied` badge (no button); others `Apply`
- [ ] Per-row submitting state; success `Plan applied to {CODE}.` + refetch
- [ ] Errors handled: 409 already applied, 404 branch/plan, 400 branchCode
- [ ] Remove flow separate: view modal → confirm → `Removed` + refetch; 400 active-members error shown

### Delete
- [ ] Confirmation matches: title `Delete plan`, message with `Cannot be undone`, destructive `Delete`
- [ ] Delete behavior matches (`DELETE /api/plans/:id`, then `Plan deleted` + refetch)
- [ ] 400 `Cannot delete plan assigned to active members` handled
- [ ] List updates correctly after success

### Permissions
- [ ] Role behavior matches RN: superadmin full, admin read-only (API also enforces)
- [ ] Branch restrictions match RN: admins see only applied-to-own-branch plans

### Responsive
- [ ] Mobile / tablet / desktop layouts
- [ ] Long plan names, large prices, many features handled (clamp + scroll)
- [ ] Modals scroll + keyboard-avoiding for forms
- [ ] Bottom-safe padding on modal action rows

### Final
- [ ] Dummy-data dev mode works without backend (§36)
- [ ] API swap uses the confirmed contracts (§35)
- [ ] Business rules (§32) verified against backend behavior
- [ ] **No changes were made to the RN codebase during this audit.**

