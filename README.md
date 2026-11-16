# learnflow-client

React + TypeScript + Vite client for LearnFlow. Part of the LearnFlow multi-repo workspace; see the meta repo README for the full setup.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server on http://localhost:5173 (`CLIENT_PORT`), proxying `/api` to the API server |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve the build locally (same proxy) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm test` / `npm run test:coverage` | Component and unit tests |
| `npm run gen:api` | Regenerate `src/api/schema.d.ts` from `contracts/openapi.json` |
| `npm run sync:contract` | Copy `../learnflow-server/openapi.json` into `contracts/` and regenerate types |

## Configuration

Copy `.env.example` to `.env`.

| Variable | Default | Notes |
|---|---|---|
| `CLIENT_PORT` | 5173 | The generic `PORT` variable is ignored. The dev server fails instead of silently picking another port. |
| `API_PROXY_TARGET` | `http://localhost:8787` | Where `/api` is proxied in dev and preview |

Never put secrets in `VITE_`-prefixed variables: they end up in the browser bundle. The AI provider key lives only on the server. A test fails if a secret-looking `VITE_` variable or a hardcoded server URL appears.

## API access

All calls go through `src/api/client.ts`:

- Paths are relative and must start with `/api/`, so the dev proxy and the production reverse proxy both apply.
- Every `POST`, `PUT`, `PATCH`, and `DELETE` automatically sends `X-Requested-With: LearnFlow`, which the server requires as CSRF protection.
- Non-2xx responses are parsed as the server's error envelope and raised as `ApiError` (`status`, `code`, `message`, `details`).
- Network failures raise a distinct `NetworkError`.
- A response with code `UNAUTHENTICATED` calls the registered session-expiry handler (see below).

## Authentication

The server owns the session: a `HttpOnly` cookie that scripts cannot read. The client never stores tokens or passwords.

- `AuthProvider` asks `/api/auth/me` on startup, so a refresh keeps you signed in.
- `ProtectedRoute` wraps every page except `/login` and `/register`. Signed-out visitors are sent to the login page and returned to the page they asked for after signing in (only in-app paths are accepted).
- If any later request reports the session ended, the user is returned to the login page with an explanation.
- Forms validate on submit with inline messages, disable the button while a request runs, and map server errors (duplicate email, wrong credentials, rate limiting) to messages that say what to do next.

### Account pages

| Page | Route | Notes |
|---|---|---|
| Verify email | `/verify?token=...` | Public. Verifies once (even under React strict mode), removes the token from the address bar, and offers a new link when it failed |
| Forgot password | `/forgot-password` | Public. Always shows the same confirmation, so it never reveals which addresses have accounts |
| Reset password | `/reset-password?token=...` | Public. Needs the new password twice; success returns to the login page |
| Settings | `/settings` | Account details, change password, and delete account (an explicit confirmation step plus the password) |

A banner above every signed-in page asks unverified users to verify their email and lets them resend the link. `index.html` sets `Referrer-Policy: no-referrer` so emailed tokens cannot leak through the Referer header.

## API contract

Types come from the server's OpenAPI document, committed at `contracts/openapi.json`. After the server contract changes:

```bash
npm run sync:contract
```

Review and commit the updated `contracts/openapi.json` and `src/api/schema.d.ts`. Do not hand-write request or response types.

## Theming

Light, dark, and system themes use the CSS variables in `src/styles/tokens.css`. The choice is stored in localStorage under a versioned key; invalid values fall back to the system theme.

## Known limitation

The mobile and tablet menu drawer closes on Escape, backdrop click, and navigation, but does not trap focus yet.
