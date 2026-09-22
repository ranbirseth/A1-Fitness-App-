# A1 FITNESS — EXISTING LOGIN & AUTH FLOW AUDIT

> **Audit only.** Nothing in this repository was modified. This document records the exact, verified authentication/login flow of the existing React Native + Expo app and its Express/MongoDB backend, so the future React.js web frontend can reproduce it faithfully.
>
> **Evidence basis:** actual source files (`src/...`, `server/...`). Where behavior was inferred or is unresolved, it is explicitly marked **INFERRED** or **C / needs confirmation**. No real credentials, tokens, JWT secrets, or key values are printed anywhere in this document.

---

## A. LOGIN FLOW DIAGRAM (actual)

```
User taps "Sign In"  →  LoginScreen.handleLogin (src/screens/LoginScreen.tsx:76)
   │  client-side validate() → { gymId, email, password, role }
   │  payload = { gymId: gymId.trim(), email: email.trim().toLowerCase(), password, role }
   ▼
useAuth().login(payload)   (src/auth/AuthContext.tsx:65)
   ▼
authApi.login(payload)     (src/api/auth.ts:21)
   ▼
api.request('/auth/login', { method:'POST', body: payload })   (src/api/client.ts:146)
   ▼  fetch(`${API_BASE_URL}/auth/login`), headers Content-Type + Authorization(none), JSON body
POST /api/auth/login
   ▼
validate(loginSchema)      (server/middlewares/validate.middleware.js + validations/auth.validation.js:15)
   ▼
auth.controller.login      (server/controllers/auth.controller.js:121)
   ├─ User.findOne({ gymId, email, ...(role && { role }) })   ← role optional in query
   ├─ !user → AppError("Invalid credentials", 401, "INVALID_CREDENTIALS")
   ├─ user.comparePassword(password) → bcrypt.compare    (user.model.js:45; bcryptjs, cost 10)
   │    └─ false → same generic 401 (does NOT reveal which failed)
   ├─ user.status === "inactive" → 403 ACCOUNT_INACTIVE
   ├─ role === "member" → Member doc must be status "active" (else 403)
   ├─ toTokens(user) → accessToken (15m) + refreshToken (7d), payload { sub, role }   (utils/tokens.js)
   ├─ user.refreshTokens.push(refreshToken)  [no cap on login; cap-4 applies on /refresh]
   ├─ res.cookie("refreshToken", …, httpOnly, secure in prod, sameSite strict, 7d)
   ▼
sendResponse → 200 { success, message:"Login successful",
                     data:{ user: sanitizeUser(user,member), accessToken, refreshToken } }   (utils/response.js)
   ▼
parseResponse validates envelope (client.ts:70) → auth.ts validates user + tokens present, role ∈ {admin, superadmin}
   ▼
AuthContext: saveSession(session) → SecureStore key "a1fitness.auth.session"   (src/auth/session.ts:30)
   ▼
setUser(session.user); setStatus("authenticated")
   ▼
RootNavigator (src/navigation/index.tsx:49) → role-based stack:
   superadmin → SuperadminDashboard | admin → AdminDashboard | else → Home (skeleton)
```

---

## B. FRONTEND FILES INVOLVED

| File | Responsibility | Important functions |
| --- | --- | --- |
| `App.tsx` | Root composition | Wraps `SafeAreaProvider > AuthProvider > StatusBar > RootNavigator` |
| `src/auth/AuthContext.tsx` | Auth state machine | `AuthProvider`, `useAuth()`, `login()`, `logout()`, session restore effect, `clearAuth` (registered as unauthorized handler) |
| `src/auth/session.ts` | Secure persistence | `saveSession`, `getSession`, `updateTokens`, `clearSession` (SecureStore key `a1fitness.auth.session`, in-memory `cachedSession`) |
| `src/auth/types.ts` | Types | `Role = 'admin' \| 'superadmin'`; `User`, `Session`, `Tokens` |
| `src/api/auth.ts` | Auth API calls | `login(payload): Promise<Session>`, `logout(refreshToken?)` |
| `src/api/client.ts` | HTTP layer | `ApiError`, `request()`, `parseResponse()`, `refreshAccessToken()`, single-flight `refreshing` promise, `setUnauthorizedHandler()`, `statusMessage()` |
| `src/config/api.ts` | Base URL | `API_BASE_URL` = `process.env.EXPO_PUBLIC_API_URL` (trailing slashes stripped) or `''` + console.warn |
| `src/screens/LoginScreen.tsx` | Login UI | `handleLogin`, `validate`, `isValidEmail`, `friendlyMessage`, role chips, show/hide password |
| `src/screens/SplashScreen.tsx` | Restore indicator | centered `ActivityIndicator` (shown while `status === 'restoring'`) |
| `src/navigation/index.tsx` | Routing by auth state | reads `useAuth().status/user`; renders Splash / Login / role-specific stacks |
| `src/components/drawer/RoleDrawerHost.tsx` | Drawer by role | `user.role === 'admin'` → `AdminDrawer`, else `SuperadminDrawer` |
| `src/components/drawer/AdminDrawer.tsx` | Admin nav | renders `user?.branchCode` in branch badge (line 106); Logout → `logout()` |
| `src/theme/colors.ts` | Design tokens | dark theme palette (primary `#E11D2E`, accent `#8b5cf6`, etc.) |

---

## C. BACKEND FILES INVOLVED

| File | Responsibility | Important functions |
| --- | --- | --- |
| `server/routes/auth.routes.js` | Mounts auth endpoints | `POST /login`, `POST /refresh`, `POST /logout`, `POST /signup`, `POST /forgot-password`, `POST /reset-password/:token`, `GET /demo-status`, `POST /demo-login` (all with `validate(...)`) |
| `server/validations/auth.validation.js` | Zod schemas | `loginSchema` (gymId≥1, email valid, password≥6; **role not in body schema**), `refreshSchema`, etc. |
| `server/controllers/auth.controller.js` | Auth logic | `login`, `refresh`, `logout`, `signup`, `forgotPassword`, `resetPassword`, `updateProfile` (exported but **not mounted** in auth.routes), `demoStatus`, `demoLogin`; helpers `toTokens`, `sanitizeUser`, `isDemoModeEnabled` |
| `server/models/user.model.js` | User document | `email` schema-level `lowercase+trim`; unique partial index `{gymId,email}`; `bcrypt.hash(password,10)` pre-save; `comparePassword` via bcrypt.compare |
| `server/middlewares/validate.middleware.js` | Zod validation | `validate(schema)` → `req.validated`; ZodError → `AppError("Validation failed", 400, "VALIDATION_ERROR", err.flatten())` |
| `server/middlewares/auth.middleware.js` | JWT/RBAC | `protect`, `protectOptional`, `authorize(...perms)`, `adminOnly`, `checkPlanAccess` |
| `server/middlewares/branchScope.middleware.js` | Branch isolation | `branchScope`, `enforceBranchOwnership(recordBranchCode, req)` |
| `server/middlewares/error.middleware.js` | Error responses | `errorHandler` → `{ success:false, message, code, data }` |
| `server/utils/tokens.js` | JWT signing | `signAccessToken` (15m default), `signRefreshToken` (7d default) |
| `server/utils/response.js` | Envelope | `sendResponse(res, { status, success, message, data })` |
| `server/utils/appError.js` | Error class | `AppError(message, statusCode, code, details)` |
| `server/utils/asyncHandler.js` | Async wrapper | `asyncHandler(fn)` → catches → next(err) |
| `server/server.js` | App assembly | CORS allowlist, helmet, `express.json({limit:'1mb'})`, cookieParser, morgan("dev"), rate limit 300/15min (skips `/api/scanners`), route mounting (`/api/auth`, etc.), Socket.IO |

---

## D. LOGIN API CONTRACT

### `POST /api/auth/login`
Public (no auth). Request body (exact field names from code):

```json
{
  "gymId": "MAIN",
  "email": "admin@example.com",
  "password": "••••••••",
  "role": "admin"
}
```

| Aspect | Verified behavior |
| --- | --- |
| Required fields | `gymId` (string min 1), `email` (must pass `z.string().email()`), `password` (min 6) — enforced by `loginSchema` |
| Optional | `role` — **not in the zod schema**; the controller adds it to the query only if truthy (`if (role) query.role = role`) |
| Accepted role values | `superadmin`, `admin`, `trainer`, `member` (User.role enum). Frontend only offers `admin` / `superadmin` and rejects other roles client-side. |
| Normalization (client) | `gymId` trimmed; `email` `.trim().toLowerCase()`; password sent raw. |
| Normalization (stored) | User schema: `email` lowercase+trim; `gymId`/`branchCode` not schema-lowercased (branchCode uppercased later in `branchScope`). |
| Normalization (query) | Controller does **not** normalize the incoming email itself — stores are lowercase and the RN client sends lowercase, so they match. **INFERRED RISK:** a caller sending mixed-case email would fail with "Invalid credentials" because the stored value is lowercase. |
| Success response | `200 { success:true, message:"Login successful", data:{ user:{...}, accessToken, refreshToken } }` |
| User object (sanitizeUser) | `_id, gymId, branchCode (|| "MAIN"), name, email, phone, role, photo, address, emergencyContact, status, paymentStatus ("paid" for admins/trainers), secretCode (members only)` |
| Also set | `Set-Cookie: refreshToken=…` httpOnly, `secure: NODE_ENV==="production"`, sameSite `strict`, `maxAge` 7 days |
| Error statuses | `400` VALIDATION_ERROR (malformed body) · `401` INVALID_CREDENTIALS · `403` ACCOUNT_INACTIVE |

### `POST /api/auth/refresh`
Public. Body `{ refreshToken? }` **or** the httpOnly cookie (`req.cookies?.refreshToken`). 401 `REFRESH_TOKEN_REQUIRED` if neither. Verifies JWT with `JWT_REFRESH_SECRET`, requires the token to still be in `user.refreshTokens` (else 401 `REFRESH_TOKEN_REVOKED`). Success: `200 { success, message:"Token refreshed", data:{ accessToken, refreshToken } }` (rotated; see F).

### `POST /api/auth/logout`
Public. Body `{ refreshToken? }` or cookie. Removes that refresh token from the user array, clears cookie, returns `200 { success, message:"Logout successful", data:{} }`. If the token is invalid it still clears the cookie and returns "Logout successful".

### `POST /api/auth/forgot-password`
Body `{ email, gymId }`. Always returns `"If your email is registered, you will receive a reset link shortly."` even when the user does not exist (deliberate, prevents enumeration). In dev it `console.log`s a reset link with the raw token (`[PASSWORD_RESET_DEBUG]`).

### `POST /api/auth/reset-password/:token`
Body `{ password }` (min 6). Hashes token (sha256), validates against `resetPasswordToken` + unexpired `resetPasswordExpire` (1h). 400 `INVALID_TOKEN` otherwise.

### `GET /api/auth/demo-status` · `POST /api/auth/demo-login`
Both inert unless `DEMO_MODE=true` (demo-login returns 404 when disabled). Demo accounts use hardcoded dev credentials in `auth.controller.js` — **not exported here**.

---

## E. ROLE BEHAVIOR (admin vs superadmin)

- **Where the role is stored:** `User.role` (enum `superadmin|admin|trainer|member`). Returned in the login response and embedded in **both JWT payloads** as `role` (payload `{ sub, role }`).
- **How the requested role is checked at login:** if `role` is sent, it is added to the `findOne` query — the **wrong role yields no user → generic 401 "Invalid credentials"** (no hint which part failed).
- **superadmin trying to log in as `admin`** → query `{ gymId, email, role:'admin' }` finds nothing → 401 generic.
- **admin trying to log in as `superadmin`** → same generic 401.
- **Omitting `role` entirely** → the user can log in as whatever their stored role is; a trainer/member with valid credentials would get tokens (member still subject to member-status check). **Frontend blocks this**: `src/api/auth.ts:34` throws if `data.user.role` is not `admin`/`superadmin`, and navigation renders a bare `Home` shell for any other role. **C:** confirm you want the web frontend to enforce the same two-role-only guarantee.
- **Permissions (backend `authorize`):** superadmin **bypasses** all permission checks. `admin` gets the `rolePermissions.admin` list (member CRUD/approve, payments, plans, workout/diet perms). Related affordances: admin can *not* create plans or trainers (verified in screen layer and RBAC).
- **Scanners:** `adminOnly` middleware restricts scanner mutations to `role==="admin"`; superadmin is read-only (course rule preserved).

---

## F. TOKEN & SESSION LIFECYCLE

**Storage (mobile):** entire `Session` (`user`, `accessToken`, `refreshToken`) as JSON in **expo-secure-store** under `a1fitness.auth.session`, with an in-memory `cachedSession` (src/auth/session.ts). Password never stored.

**Access token:** attached to authenticated requests as `Authorization: Bearer <accessToken>`. Default TTL **15m** (`ACCESS_TOKEN_EXPIRES_IN`). No expiry check client-side — refresh is triggered by HTTP 401.

**Refresh token:** TTL **7d** (`REFRESH_TOKEN_EXPIRES_IN`), also mirrored to an httpOnly cookie on login/refresh. Rotation on every use: backend verifies + checks membership in `user.refreshTokens`, then `user.refreshTokens = user.refreshTokens.slice(-4)` and pushes the new one → **cap of 4 stored refresh tokens** (login pushes without capping; demo-login caps at 10 — noted inconsistency). Reuse of an old (rotated-out/revoked) token → 401 `REFRESH_TOKEN_REVOKED`.

**401 → refresh → retry-once (exact, client.ts:169–206):**
1. Authenticated request returns 401.
2. If no refresh is in flight, start `refreshing = refreshAccessToken().finally(() => refreshing = null)`.
3. Every concurrent 401 **awaits the same `refreshing` promise → single-flight refresh** (one refresh request, not one per caller).
4. On success: retry the original request **once** with the new access token.
5. Refresh failure paths:
   - Network drop during refresh → keep stored session, return `not ok` → "Unable to reconnect…" (user is **not** logged out).
   - Server 401/403 or malformed → `clearSession()` → `unauthorizedHandler()?.()` → AuthContext `clearAuth` → back to Login "Your session has expired. Please sign in again."
   - No stored refresh token → `{ ok:false }` → same as above.

**Logout (exact):** `AuthContext.logout` → snapshot session → `authApi.logout(refreshToken)` (fire-and-forget `POST /auth/logout`, errors swallowed) → `clearSession()` → `setUser(null)` → `status = unauthenticated` → navigator renders Login. **Local state clears unconditionally — even fully offline.** Backend removes the specific refresh token server-side and clears the cookie.

---

## G. SESSION RESTORATION (startup)

1. App mounts → `AuthProvider` starts with `status = 'restoring'`.
2. `RootNavigator` renders `SplashScreen` (spinner) while restoring.
3. `useEffect` (AuthContext.tsx:44) → `getSession()` (SecureStore → JSON → shape-validated).
   - **Session present** → `setUser(session.user)`, `status = 'authenticated'` → role-based stack. **No eager refresh/validation of the access token** — a (possibly expired) access token is accepted optimistically and refreshed lazily on the first 401.
   - **No/invalid session** → `status = 'unauthenticated'` → Login.
4. `api.setUnauthorizedHandler(clearAuth)` installed so a failed refresh mid-session returns the app to Login.

---

## H. ROUTE / RBAC PROTECTION

**Frontend:** role-based route registration (not guards-on-each-route): `RootNavigator` renders the superadmin stack **only** for `role==='superadmin'`, the admin stack **only** for `role==='admin'`, and `Login` for unauthenticated. Admin never has superadmin screens in its stack (and vice-versa; admin-only Scanner mock screens exist only in the admin stack). Unknown role → `Home` shell.

**Backend (composed per-request):**
- `protect`: parses `Bearer` token, `jwt.verify` with `JWT_ACCESS_SECRET`, loads user via `findById(decoded.sub).select("-password -refreshTokens")`, blocks `status==="inactive"` (403), and for members blocks `BLOCKED_MEMBER_STATUSES`.
- `authorize(...perms)`: superadmin bypass; otherwise requires every requested permission from the role's permission map → else 403.
- `adminOnly`: `role !== "admin"` → 403 (scanner mutations).
- `branchScope`: for non-superadmin, forces `req.branchCode = (user.branchCode || "MAIN").trim().toUpperCase()` and overwrites `req.query.branchCode`. Superadmin may pass `branchCode` query ("ALL"/any).
- `enforceBranchOwnership(recordBranchCode, req)`: superadmin always true; otherwise compares record's branchCode to the user's. Cross-branch access is denied as `404 "Member not found in your branch"` (member/plan/scanner/trainer/progress/booking controllers). Tests (`server/test/membership-payment.test.js:115–125`) assert admin MAIN cannot see KOLKATA but CAN see `ANYWHERE`-style global records.

---

## I. BRANCH ISOLATION (Branch Admin)

- **Exact field name:** `branchCode` on the `User` document (default `"MAIN"`). There is no separate `branchId`/`branch` used in auth.
- **Source:** the login response `${user}.branchCode` (defaults to `"MAIN"` in `sanitizeUser` if absent) → stored in the session. **It does NOT come from the JWT** (JWT carries only `sub` + `role`).
- **Used by backend:** `branchScope` scopes every list query; `enforceBranchOwnership` guards single-record operations (both treat superadmin as global).
- **Used by app:** `AdminDrawer.tsx:106` renders the branch badge as `user?.branchCode || '-'` from `useAuth().user` — i.e. the stored session user. The React.js Admin layout should populate its equivalent badge from the same session field.

---

## J. LOGIN UI BEHAVIOR (LoginScreen.tsx — current)

| Aspect | Verified |
| --- | --- |
| Fields | Gym ID, Email, Password, Role (chips) |
| Defaults | `gymId = 'MAIN'`, `role = 'superadmin'`, email/password empty |
| Role chips | Two tab-like chips: labels **"Super Admin"** and **"Admin"**; selected = primary border + accent text |
| Placeholders | Gym ID "e.g. MAIN", Email "name@example.com", Password "Enter your password" |
| Keyboard | Gym ID autoCapitalize chars; Email keyboard email-address; password field `returnKeyType="done"` + `onSubmitEditing={handleLogin}`; wrapped in KeyboardAvoidingView(iOS padding) + ScrollView with `keyboardShouldPersistTaps="handled"` |
| Show/hide password | Toggle renders "Show"/"Hide" (primary color), disabled while submitting |
| Client validation | gymId required; email required + regex; password required + ≥6; role required. Inline red field errors under each control; error border = `danger`. |
| Submit | Button "Sign In"; when busy → inline `ActivityIndicator`, button opacity 0.6, all inputs + chips disabled |
| Error display | Server/API errors pass through `friendlyMessage()` → rendered in a red error box above the button (danger border, translucent red bg) |
| Branding | Logo tile "A1" (84px, primary bg, rounded), "A1 FITNESS" 24px/800/letterSpacing 3, "Staff Access" tagline; heading "Sign in" + subheading "Enter your staff credentials" |
| Layout | Centered form card, `maxWidth: 420`, horizontal padding 24, dark theme (`background #0B0E11`, inputs `#14181E`, border `#2A333D`) |
| Logout link on login | None. No external links. No demo-login UI. |

**`friendlyMessage` mapping (LoginScreen.tsx:31–45):**
- contains `inactive`/`disabled`/`deactivated` → **"This account is inactive. Contact your administrator."**
- contains `credential`/`invalid`/`password`/`email` → **"The credentials you entered are incorrect."**
- otherwise → backend message verbatim (≤200 chars via client sanitizer).

---

## K. ERROR MAPPING (exact)

| Backend condition | HTTP | code | Backend message | Frontend message shown |
| --- | ---: | --- | --- | --- |
| Nonexistent user | 401 | `INVALID_CREDENTIALS` | `Invalid credentials` | "The credentials you entered are incorrect." |
| Wrong password | 401 | `INVALID_CREDENTIALS` | `Invalid credentials` | "The credentials you entered are incorrect." |
| Wrong role selected | 401 | `INVALID_CREDENTIALS` | `Invalid credentials` (no matching user) | "The credentials you entered are incorrect." |
| Account inactive | 403 | `ACCOUNT_INACTIVE` | `Your account has been deactivated. Please contact admin.` | "This account is inactive. Contact your administrator." |
| Member pending (if reachable) | 403 | `ACCOUNT_INACTIVE` | `Your account is pending approval. Please wait for admin approval.` | Shown verbatim (no keyword match) |
| Missing/invalid body fields | 400 | `VALIDATION_ERROR` | `Validation failed` (+ zod details) | "Validation failed" (client pre-empts most cases) |
| Backend URL not configured | — | — | client-generated | "Backend URL is not configured. Set EXPO_PUBLIC_API_URL for this app." |
| Network failure | — | — | client-generated | "Network unavailable. Please check your connection and try again." |
| Refresh: missing token | 401 | `REFRESH_TOKEN_REQUIRED` | `Refresh token required` | session-expiry path (client) |
| Refresh: invalid/revoked | 401 | `REFRESH_TOKEN_REVOKED` / `INVALID_REFRESH_TOKEN` | `Refresh token revoked` / `Invalid refresh token` | "Your session has expired. Please sign in again." (client, after clearSession) |
| Server error | 500 | `INTERNAL_ERROR` | `Internal server error` | Shown verbatim |
| Response lacking user/tokens | — | — | client-generated | "The server returned an unexpected response." |
| Response user role ∉ {admin, superadmin} | — | — | client-generated | "This account is not permitted to sign in." |

---

## L. SECURITY FINDINGS (auth/session only)

- **Secrets/config:** `server/.env` and root `.env.local` exist.
  **SECRET PRESENT — VALUE NOT DISPLAYED** (JWT secrets and API config are sourced from env, never from code; nothing was read or printed).
- **Password handling:** bcryptjs cost 10 (verified `user.model.js` pre-save); plaintext password never returned/logged; login 401 is **indistinguishable** for "no such user" vs "wrong password" (no user enumeration).
- **JWT hygiene:** payload minimal `{ sub, role }` (no PII); `protect` loads user with `-password -refreshTokens`; refresh tokens stored server-side and rotated with a 4-token cap; revoked/reused old tokens rejected.
- **Transport/headers:** request feed capped (`express.json limit 1mb`); helmet active (`contentSecurityPolicy:false`); rate limit 300/15min per IP (skips `/api/scanners`); CORS allowlist incl. `http://localhost:5173` and `https://a1-fitness-alpha.vercel.app`, `credentials:true`, allowed headers `Content-Type`, `Authorization`.
- **Refresh cookie:** httpOnly + sameSite strict + secure in prod — good fit for a browser-based web client.
- **Exposure found:**
  1. `LoginScreen.tsx:84` logs a `[LOGIN-DIAG]` line containing gymId/email/role on submit (no password/tokens, but PII; flagged for removal).
  2. `forgotPassword` prints the reset link **including the raw reset token** to the server console in dev (functionality has no UI yet).
  3. Auth code path inconsistency: login/demo-login push refresh tokens without the cap-4 rotation used by `/refresh`.
- **No leakage observed:** morgan("dev") logs method/URL/status/time, not headers; ApiError sanitizer caps server messages at 200 chars; zod details go to clients only.

---

## M. REACT.JS PORTING PLAN

### Must preserve exactly
- Request contract: `POST /api/auth/login` body `{ gymId, email, password, role }`; get model.
- Endpoints: `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`.
- Role values `admin` / `superadmin` and the two-role-only gate (`role` not in user → reject; UI offers only the two chips).
- Error semantics + `friendlyMessage()` mapping (exact strings in K).
- RBAC + branch isolation behavior (superadmin global; admin = own `branchCode`, badge from session).
- Single-flight 401 → refresh → retry-once, and "never log the user out on a transient network drop during refresh".
- Logout always clears local session even if the network call fails; navigate to Login.
- `sanitizeUser` field set consumed by the web shell (esp. `branchCode`, `status`, `role`).

### Must be adapted for web
- **expo-secure-store → web**: replace with a web session strategy (see C items). Prefer relying on the backend's **httpOnly sameSite-strict Secure cookie** for refresh + keeping the access token in JS memory (refreshed from cookie), falling back to `sessionStorage`/`localStorage` patterns only if the owner prefers.
- React Navigation → React Router; role-based stacks become role-based route trees + guards. Drawer → responsive sidebar (admin branch badge from `user.branchCode`).
- RN `StyleSheet`/components → CSS + React components; preserve design tokens from `src/theme/colors.ts` exactly.
- `EXPO_PUBLIC_API_URL` → `VITE_API_URL` (dotenv) with the same loud warn-if-missing behavior.
- Keyboard/show-password/disabled states → native HTML equivalents, responsive desktop layout.

### Needs owner confirmation (unresolved — not decided silently)
1. Web token/session storage strategy (httpOnly cookie vs localStorage vs hybrid). **C**
2. Production API base URL for the web build (none hardcoded today). **C**
3. CORS: the React.js dev origin/domain must be added to `server.js` `allowedOrigins` (only localhost:5173 + Vercel alpha are there now). **C**
4. Whether the web Login keeps the `gymId` multi-tenant field (default "MAIN") or hides it. **C**
5. Whether to also block login for `trainer`/`member` accounts server-side, or keep the current client-side-only two-role gate. **C**

---

## N. OPEN DECISIONS / C ITEMS

- [ ] Web session storage strategy (cookie vs localStorage vs hybrid) — affects refresh + logout design.
- [ ] Confirmed production API URL (today: `EXPO_PUBLIC_API_URL` env only).
- [ ] New web origin added to backend CORS allowlist.
- [ ] Keep or drop the gymId field on web login.
- [ ] Server-side two-role-only enforcement (or keep client-side gate).
- [ ] Remove the `[LOGIN-DIAG]` logging line in `LoginScreen` when the RN app is retired (PII).
- [ ] Run `npm test` in `server/` to confirm auth-adjacent suites (`membership-payment`, `reminder`, `scanner-*`, `whatsapp-env`) pass and record exact counts.
- [ ] Decide demo-login handling (backend feature is inert unless `DEMO_MODE=true`; do not port for production).

All other behavior in this audit is **verified from source code**. Only the items marked **INFERRED** (email-query normalization risk; concurrent-401 single-flight already verified) or **C** above require confirmation.

---

## O. RECOMMENDED NEXT STEP

**Build the React.js Login page + authentication foundation only** (no dashboard screens yet):

1. Scaffold the web app (Vite + React + TypeScript), `VITE_API_URL`, and a `client` module that ports `src/api/client.ts` behavior: envelope parsing, `Bearer` attach, single-flight 401 → refresh → retry-once, sanitized errors, `setUnauthorizedHandler`.
2. Port `src/auth` (`AuthContext` status machine `restoring/authenticated/unauthenticated`, `login`, `logout`, restore-on-mount) and `src/api/auth.ts` (same validation + two-role gate), with the web storage primitive implemented per N-1.
3. Recreate `LoginScreen` visually (brand block, gymId/email/password, role chips defaulting to Super Admin, show/hide password, inline validation, busy state, error box) using the exact theme tokens; route to a placeholder authenticated shell per role.
4. Verify: login (superadmin + admin), wrong-role 401 mapping, inactive 403 mapping, refresh-on-401 with a second request, logout (incl. offline), and session restore.

Only after that foundation passes do we proceed to the role-based dashboard layout.