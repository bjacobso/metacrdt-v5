# Better Auth Component Setup Plan

## Goal

Install and wire `@convex-dev/better-auth` as this app's real authentication
provider so the hosted demo can support sign-in, protected Convex writes, and
future production auth without a custom dummy JWT issuer.

The first usable slice should support easy demo auth online. Prefer Better
Auth's supported email/password or anonymous flows over a client-only bypass.
The backend must continue deriving identity from Convex auth through
`ctx.auth.getUserIdentity()`.

## Source Documentation

- Component package: `@convex-dev/better-auth`
- Install command from component docs:
  `npm install @convex-dev/better-auth`
- Convex component markdown:
  `https://www.convex.dev/components/better-auth/better-auth.md`
- Convex component `llms.txt`:
  `https://www.convex.dev/components/better-auth/llms.txt`
- Full Convex + Better Auth docs:
  `https://labs.convex.dev/better-auth`
- React/Vite guide:
  `https://labs.convex.dev/better-auth/framework-guides/react`
- Authorization guide:
  `https://labs.convex.dev/better-auth/basic-usage/authorization`
- Better Auth test utilities:
  `https://better-auth.com/llms.txt/docs/plugins/test-utils.md`
- Better Auth anonymous plugin:
  `https://better-auth.com/llms.txt/docs/plugins/anonymous.md`

## Current Repo State

- Package manager is `pnpm@10.20.0`.
- `convex` is already `^1.40.0`, which satisfies the component's documented
  `convex >= 1.25.0` requirement.
- `convex/auth.config.ts` exists but intentionally fails closed with
  `providers: []`.
- `src/main.tsx` already wraps the app in `ConvexProviderWithAuth`, but the
  current `useNoAuthProvider` always returns signed out and no access token.
- `src/auth.tsx` has app-level auth UI state and write gates based on
  `useConvexAuth()`.
- Protected writes already expect server-derived identity and should remain
  protected.
- `convex/convex.config.ts` already registers:
  - `@convex-dev/static-hosting`
  - `@metacrdt/convex`
- `convex/http.ts` currently registers static hosting with `spaFallback: true`.
  Better Auth routes must be registered before static hosting routes.

## Recommendation

Use Better Auth as the demo and eventual production auth substrate.

For the immediate online demo, use one of these two blessed development paths:

1. Email/password with `requireEmailVerification: false`
   - Best when we want demo users to enter visible dummy emails.
   - Supports "accept dummy emails" by allowing normal sign-up/sign-in with a
     known demo password.
   - This is not a test bypass; it creates real Better Auth users and Convex JWT
     sessions.

2. Anonymous plugin
   - Best when we want one-click "Continue as guest."
   - Official Better Auth plugin and listed as supported by the Convex
     integration.
   - Can later link anonymous users to email/password accounts.

For automated tests, use Better Auth's `testUtils()` plugin only in a test-only
auth instance. Do not add `testUtils()` to the production auth config.

## Non-Negotiable Auth Invariants

- Do not accept a user ID, email, or role from client arguments for
  authorization.
- Keep write authorization based on `ctx.auth.getUserIdentity()`.
- Prefer `identity.tokenIdentifier` for durable identity keys.
- Use Convex auth state (`useConvexAuth()`, `<Authenticated>`,
  `<Unauthenticated>`, `<AuthLoading>`) for UI gates that call authenticated
  Convex functions.
- Do not use Better Auth `useSession()` as the only signal before calling
  protected Convex functions, because Convex still needs to validate the token.
- Do not ship a client-only dummy auth provider.

## Phase 1: Install Packages

Run:

```bash
pnpm add @convex-dev/better-auth better-auth@~1.6.15
```

The component docs show `npm install @convex-dev/better-auth`; the React/Vite
guide also installs Better Auth itself and pins it near `1.6.15`.

After install:

```bash
pnpm exec convex dev
```

Keep `convex dev` running while adding component files so generated types update.

## Phase 2: Register the Convex Component

Edit `convex/convex.config.ts`.

Add:

```ts
import betterAuth from "@convex-dev/better-auth/convex.config";
```

Then register it alongside existing components:

```ts
const app = defineApp();
app.use(selfHosting);
app.use(metacrdtConvex, { name: "metacrdt" });
app.use(betterAuth);
```

Open question: register `betterAuth` before or after `metacrdt`. The docs do not
require a specific order. Use the default name `betterAuth` because docs and
generated `components.betterAuth` examples assume it.

## Phase 3: Configure Convex JWT Auth

Replace the fail-closed `convex/auth.config.ts` with Better Auth's provider.

Expected shape:

```ts
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
```

This is the piece that makes `ctx.auth.getUserIdentity()` non-null when the
client has a valid Better Auth Convex JWT.

## Phase 4: Create the Better Auth Server

Add `convex/auth.ts`.

Use the React/Vite guide's starter shape:

```ts
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth/minimal";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      crossDomain({ siteUrl }),
      convex({ authConfig }),
    ],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});
```

Notes:

- Use `better-auth/minimal` to keep Convex bundle size down.
- Keep `requireEmailVerification: false` for the demo slice.
- Add social providers later, after the basic flow is working.
- Consider `registerRoutesLazy()` in `convex/http.ts` if Convex reports bundle
  memory issues.

## Phase 5: Mount Better Auth HTTP Routes

Edit `convex/http.ts`.

Register Better Auth routes before static hosting:

```ts
import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { authComponent, createAuth } from "./auth";
import { components } from "./_generated/api";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

registerStaticRoutes(http, components.selfHosting, {
  spaFallback: true,
});

export default http;
```

Route ordering matters because static hosting uses SPA fallback for unmatched
paths. Auth routes must be installed first.

## Phase 6: Create the Frontend Auth Client

Add `src/lib/auth-client.ts`.

```ts
import { createAuthClient } from "better-auth/react";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
  plugins: [convexClient(), crossDomainClient()],
});
```

If we add anonymous auth in Phase 10, also add `anonymousClient()` from Better
Auth's client plugins.

## Phase 7: Replace the No-Auth Provider

Edit `src/main.tsx`.

Replace `ConvexProviderWithAuth` and `useNoAuthProvider` with
`ConvexBetterAuthProvider`.

Expected shape:

```tsx
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "./lib/auth-client";

const convex = new ConvexReactClient(convexUrl, {
  expectAuth: true,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <AuthUiProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthUiProvider>
    </ConvexBetterAuthProvider>
  </React.StrictMode>,
);
```

Open question: `expectAuth: true` pauses unauthenticated queries. This app has
public read surfaces today, so test carefully. If public reads stall signed out,
omit `expectAuth: true` and keep write gates signed-in only.

## Phase 8: Update Auth UI

Edit `src/auth.tsx` and `src/Layout.tsx`.

Minimum demo UI:

- Signed-out state:
  - "Sign in" button opens a real form.
  - Form fields:
    - email
    - password
  - Buttons:
    - "Sign in"
    - "Create demo account"
- Signed-in state:
  - show current user email if available
  - show "Sign out"
- Errors:
  - invalid email
  - weak password
  - wrong credentials
  - auth service unavailable

Implementation details:

- `Create demo account` calls `authClient.signUp.email`.
- `Sign in` calls `authClient.signIn.email`.
- `Sign out` calls `authClient.signOut`.
- Keep `useWriteGate()` based on `useConvexAuth()`.
- Do not let Better Auth's client session alone enable protected write controls.

Demo defaults:

- Suggested email: `demo@example.com`
- Suggested password: `password1234`
- Do not prefill a real user's email.
- Keep UI copy clear that this is a demo account, not verified production auth.

## Phase 9: Required Environment Variables

Convex deployment env:

```bash
pnpm exec convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
pnpm exec convex env set SITE_URL http://localhost:5173
```

Frontend `.env.local` for local Vite:

```env
CONVEX_DEPLOYMENT=dev:your-deployment-name
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
```

For hosted static deployment:

```bash
pnpm exec convex env set SITE_URL https://your-deployment.convex.site
```

If the frontend is hosted somewhere other than `.convex.site`, use that hosted
frontend origin for Convex `SITE_URL`. Keep `VITE_CONVEX_SITE_URL` pointed at
the Convex `.site` origin that serves Better Auth HTTP routes.

Future OAuth provider env vars:

- Google:
  - provider client ID
  - provider client secret
  - authorized redirect URI:
    `https://your-deployment.convex.site/api/auth/callback/google`
- GitHub:
  - provider client ID
  - provider client secret
  - callback URL:
    `https://your-deployment.convex.site/api/auth/callback/github`

## Phase 10: Blessed Dev and Testing Auth Options

### Development Demo Auth

Use email/password with verification disabled for the first pass:

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: false,
}
```

This is the most direct replacement for "dummy emails." It still persists real
users, sessions, and accounts through Better Auth and the Convex component.

### One-Click Guest Auth

If the demo should avoid passwords, add the Anonymous plugin later.

Server:

```ts
import { anonymous } from "better-auth/plugins/anonymous";

plugins: [
  anonymous(),
  crossDomain({ siteUrl }),
  convex({ authConfig }),
]
```

Client:

```ts
import { anonymousClient } from "better-auth/client/plugins";

plugins: [convexClient(), crossDomainClient(), anonymousClient()]
```

Then the UI can call:

```ts
await authClient.signIn.anonymous();
```

The Convex component docs list Anonymous as a supported plugin.

### Automated Tests

Use Better Auth's `testUtils()` plugin only in a test-only auth instance.

Do not include `testUtils()` in the production `createAuth` config. It does not
create public routes, but it exposes privileged server-side helpers through
`ctx.test`, so keep it out of shipped auth code.

Use test utils to:

- create users
- save users
- create sessions
- produce auth headers/cookies for integration or browser tests
- capture OTPs if we later use email OTP

## Phase 11: Authorization Integration

After Better Auth is wired, review protected Convex functions.

Keep this pattern:

```ts
const identity = await ctx.auth.getUserIdentity();
if (identity === null) {
  throw new Error("Not authenticated");
}
```

If app-level user details are needed, use:

```ts
const user = await authComponent.getAuthUser(ctx);
```

Guidance:

- Use `ctx.auth.getUserIdentity()` for fast auth presence and JWT claims.
- Use `authComponent.getAuthUser(ctx)` when session validation or Better Auth
  user data is needed.
- Do not add a parallel `users` table unless a feature needs app-specific user
  profile data outside Better Auth.

## Phase 12: Verification

Static checks:

```bash
pnpm typecheck
pnpm exec vitest run convex/writeAuth.test.ts
```

Local app verification:

```bash
pnpm exec convex dev
pnpm dev:web
```

Manual flow:

1. Open `http://localhost:5173`.
2. Confirm signed-out UI renders without protected write access.
3. Click Sign in.
4. Create a demo account with `demo@example.com` and `password1234`.
5. Confirm `useConvexAuth()` reports authenticated and the layout shows signed
   in.
6. Create a component-owned entity.
7. Confirm the write succeeds.
8. Confirm the backend author/principal comes from Convex auth, not a client
   argument.
9. Sign out.
10. Confirm protected writes are blocked again.

Hosted verification:

1. Set hosted `SITE_URL`.
2. Deploy Convex functions.
3. Build and deploy static hosting.
4. Open the hosted URL.
5. Repeat the manual flow above.
6. Confirm auth cookies and callbacks use the `.convex.site` auth origin.

Debugging:

- Enable backend verbose logs with `createClient(components.betterAuth, {
  verbose: true })` if needed.
- Enable Convex client verbose logs if token handoff is unclear.
- If Convex code push reports memory pressure, use `registerRoutesLazy()` and
  Better Auth plugin subpath imports.

## Phase 13: Production Follow-Up

Before calling this production-ready:

- Decide whether email verification is required.
- Add transactional email for verification and password reset.
- Decide whether sign-up should be open or invite-only.
- Add OAuth providers if needed.
- Add account recovery UX.
- Add rate-limit and abuse controls if public sign-up is enabled.
- Review cookie/domain behavior for final hosting domain.
- Add end-to-end auth tests around sign-up, sign-in, sign-out, and protected
  writes.

## Open Questions

- Should the first demo use email/password or anonymous "Continue as guest"?
- Should public demo sign-up be unrestricted, domain-restricted, or invite-only?
- Should local public reads remain available while signed out? This determines
  whether `expectAuth: true` is appropriate.
- Should the auth dialog stay modal-only, or should there be a `/login` route
  for easier demo links?

## Non-Goals

- Do not build a custom dummy JWT issuer in this slice.
- Do not implement OAuth providers until email/password or anonymous auth works.
- Do not add an app-specific user profile table unless a feature needs it.
- Do not weaken existing backend authorization checks.
- Do not ship test-only auth helpers in production auth config.
