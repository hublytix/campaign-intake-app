# Campaign Intake (local unpublished preview)

A self-serve campaign intake app for **Asana only**. It has three screens: admin setup, an intake form, and a dashboard. Approvals and check-ins happen in the app. This repository is a local preview. It is **not** listed in the Asana App Directory and should not be deployed publicly until you decide to.

## Demo mode vs real mode

If none of the real-mode environment variables are set, the app starts in **Demo mode**. It uses example and locally saved data. It will not connect to Asana and it will never claim that an Asana project was created.

If every required variable is set, the app runs in **Real mode**. Asana projects and tasks are created only after an explicit confirmation in the UI, and only in a workspace listed in `ASANA_ALLOWED_WORKSPACE_GID`.

If only some of the real-mode variables are set, the app **fails closed**. It does not silently fall back to demo mode and it will not start OAuth or write to Asana.

Required for real mode (names only; put values in `.env.local`, never in git):

- `ASANA_CLIENT_ID`
- `ASANA_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY` (32 bytes, 64 hex characters)
- `SESSION_SECRET` (32 bytes, 64 hex characters)
- `ASANA_ALLOWED_WORKSPACE_GID`

This product uses its own Asana OAuth app. It does not reuse any chat or connector authorization.

## Run locally

```bash
cp .env.example .env.local
npm install
npm test
npm run typecheck
npm run lint
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app stores data in `data/app.sqlite` (gitignored).

## Register a private Asana app (real mode only)

1. Sign in to Asana and open [the developer console](https://app.asana.com/0/my-apps).
2. Create a new app. Do not set distribution to “Any workspace” and do not submit it for review.
3. Add the redirect URL `http://localhost:3000/api/asana/oauth/callback` (or your `APP_BASE_URL` plus that path).
4. Enable only these scopes: `openid`, `email`, `profile`, `workspaces:read`, `teams:read`, `users:read`, `project_templates:read`, `projects:read`, `projects:write`, `tasks:read`, `tasks:write`, `stories:read`, `stories:write`.
   If you connected Asana before the two `stories` scopes were added, disconnect and reconnect so the new scopes are granted.
5. Copy the client ID and secret into `.env.local`, set the two 32-byte keys, and set `ASANA_ALLOWED_WORKSPACE_GID` to your test workspace GID.

The callback uses a one-time `state` cookie and PKCE (`S256`). Tokens are encrypted at rest with `TOKEN_ENCRYPTION_KEY` and are never returned to the browser.

## What this version does

- Configurable form fields, naming and UTM patterns, generic Event / Content asset / Growth play starters, and in-app approval rules
- Drafts, submit, approve or reject (a comment is required to reject)
- After confirmation, creates an Asana project and starter tasks with dates counted back from the launch date
- Dashboard status and status refresh
- Check-ins: in real mode, "Send check-in" posts a comment on the Asana task that @-mentions its owner. The owner replies on the task starting with `done`, `delayed` or `blocked` (plus an optional note), and "Refresh status" reads the reply back. Replies can also be recorded by hand in the app. In demo mode nothing is sent.
- Disconnect Asana (revoke and delete stored tokens) and delete all local workspace data

## What it does not do

- HubSpot, Microsoft Teams, SharePoint, Salesforce, or growth-play deck / file generation
- Public hosting, marketplace registration, or billing
- Using Myridius or other client documents as product source data

## Legal pages

`/legal/privacy` and `/legal/terms` are clearly marked **DRAFT — not approved legal compliance**. They are placeholders for local development only.

## Security notes

- Session and OAuth cookies are HTTP-only and `SameSite=lax`
- Mutating API routes require a matching `Origin`
- Workspace allow-list is enforced before Asana writes
- Duplicate campaigns with the same generated name and launch date are blocked
- Logs and API errors are written so they do not include access tokens
