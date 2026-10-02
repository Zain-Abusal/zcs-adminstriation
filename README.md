# ZCraft admin workspace

A standalone Vite/React admin site using the storefront's existing Supabase database and admin roles. This repository builds independently: all shared ZCraft components, branding, icons, styles, and Markdown rendering are checked in under `src/shared/`.

## Run locally

Use Node 24 (Node 22.18+ also supports the test suite):

```sh
npm ci
cp .env.example .env.local
# Fill in the storefront's Supabase URL and PUBLIC/publishable key.
npm run dev
```

Do not use a secret or service-role key in frontend configuration.

## Deploy this repository to Vercel

- Root Directory: the repository root (`.`), not `admin`.
- Framework: Vite.
- Install command: `npm ci`.
- Build command: `npm run build`.
- Output directory: `dist`.
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the deployment environment.
- For Ziina, set server-only env vars: `ZIINA_API_KEY`, `ZIINA_PAYMENT_URL`, and `ZIINA_COMPLETED_PAYMENT_URL`.
  Optional: `ZIINA_API_BASE_URL`, `ZIINA_TEST_MODE=true`, and `ADMIN_API_RATE_LIMIT`.
- Commit `src/shared/`, `package-lock.json`, fonts, and image assets along with the application.

There are no build-time imports from the original storefront and no requirement to include files outside this repository. The previous TS2307 errors came from `@/*` pointing to `../src`; it now points to `./src/shared/*`.

No-index metadata, robots.txt, and response headers are included. Enable Vercel Deployment Protection if the login page itself should be inaccessible to the public; no-index directives alone cannot guarantee an undiscoverable URL.

## Workspace

- Overview with live counts, recent products, incoming briefs, and a traffic chart.
- Grouped navigation for catalog, content, community, insights, and workspace settings.
- Search across all matching records, status filters, sorting, and pagination.
- Side-panel editors with named sections, draft defaults, product/account selectors, dollar-style amount entry stored as cents, and one-item-per-line list inputs.
- Preview mode for content, cover images, and Markdown images. Blog cover/gallery URLs can use any HTTP(S) image host. Use direct image URLs; the source host must allow embedding.
- Save/error toasts, unsaved-change protection, delete confirmation, keyboard-accessible dialogs, and reduced-motion support.
- Page-traffic and article-engagement charts for 7/14/30/90 days, optional bot inclusion, top pages/articles, and accessible daily values. UTC date grouping. Reads are capped at 10,000 records with an explicit partial-data notice; use a shorter range when needed.
- Announcement banner editing and existing-account role management.
- Orders workspace for manual/custom-request orders, priority, paid/unpaid state, completion, internal notes, archive/restore, and delete.
- Ziina hosted payment URL creation through a rate-limited serverless API. Ziina secrets are never bundled into the browser.
- Read-only security events for admin API attempts, IP logging, and Ziina request status.

Legacy order items, licenses, downloads, coupons, product media, and changelog are intentionally excluded from navigation. No database tables are deleted. Existing user profiles remain available for account selectors.

Run `supabase/admin-workspace-upgrades.sql` on the Supabase project before using the new order fields and optional API audit log.

## Database access

Connect to the existing project with its existing schema and RLS policies. The account must already exist in Supabase Auth and have an `admin` entry in `public.user_roles`. Login does not create accounts or grant privileges. `has_role` and RLS remain the authorization boundary; no secret key is bundled.

Use the storefront repository's existing migrations for schema setup, including admin access, site settings, and news-write grants. This UI change does not apply migrations remotely.

## Keep the shared UI in sync

The shared files are copies of the original storefront implementation, not a new component library. To refresh them when the original UI changes:

```sh
npm run sync:shared -- /absolute/path/to/zcs/src
```

Review and commit the updated `src/shared` files. This script is an explicit maintenance step and is never required during a Vercel build.

## Verify

```sh
npm test
npm run build
```

Tests cover field serialization, price conversion, search escaping, external image URLs, date ranges, and chart aggregation. Browser flows should use mocked data or a test project for writes; do not use production records as test fixtures.

## Standalone DRM administration

The DRM & licensing sidebar connects to the separate licensing API through `api/drm.mjs`. Set the server-only `LICENSE_ADMIN_API_TOKEN` to its existing 32-character token; `LICENSE_API_URL` defaults to `https://licenses.zcraftstudios.com`. Never prefix this token with `VITE_`. Your existing Supabase login and `workspace_can_access` protect each proxy request. API mode needs only the licensing API admin token.

DRM collections retain records while refreshing in the background, refresh every minute while visible, and preload tabs on hover/focus. Record details open in a keyboard-accessible modal. Newly created/rotated keys appear only once and remain in component memory until dismissed. Local `npm run dev` includes the DRM proxy; Vercel executes the server function. Static `vite preview` cannot serve API requests.

Review and testimonial sources use the storefront enum values `BuiltByBit`, `Trustpilot`, and `Other`. The storefront review-source migration must be applied to the connected database. Orders and Ziina use the existing commerce integration and `supabase/admin-workspace-upgrades.sql` requirements described above.


## Staff accounts and page permissions

Open **Workspace → Staff & permissions** as an existing administrator. Add an existing Supabase Auth user UUID and assign each page **No access**, **Read**, **Edit** (create/update), or **Manage** (also deletion and sensitive actions). Staff should not receive the `admin` role: administrators retain unrestricted access and can manage access. Disable an account here to immediately block its database/API workspace permissions; existing navigation refreshes within a minute. This does not disable the person's customer account.

The primary project's staff schema and policies were installed during this implementation. Fresh projects should apply the files in `supabase/migrations/` once, in filename order, after the storefront schema and admin workspace upgrades. Do not replay them on the already-configured production project. Permission saves are transactional and changes are recorded in `workspace_permission_audit`; owners can see the latest 25 entries. Public storefront reads remain public; page permissions control workspace access. Privileged analytics retention is now restricted to backend service-role execution.

Relevant collection pages include status, content, source, and UTC date filters. Exact text filters apply on blur/Enter; dropdowns apply immediately. DRM provides request method/status/route/request ID, validation outcome/reason, license status/customer, product flags, audit entity/action, search, and date filters.

## Faster DRM reads from the second Supabase project

The `admin-drm-read` Edge Function is installed in your ZCS License Supabase project. `VITE_DRM_SUPABASE_URL` and `VITE_DRM_SUPABASE_PUBLISHABLE_KEY` point the browser to this function and are prefilled in `.env` and `.env.example`; these values are public. Add them to Vercel's build environment when deploying the dashboard. You do not need to copy the second project's secret key to use this direct path.

The DRM selector offers **Auto**, **Supabase database**, and **Licensing API**. With the public DRM connection configured, Auto and Supabase send reads directly from the browser to the authenticated Supabase endpoint. This skips the dashboard server and licensing API read hops. The endpoint verifies the primary project's bearer token and checks that user's page permissions on every request, then queries private `zcslic_*` tables with its built-in server credential. The primary publishable URL/key are pinned in the function's source; if rotated, update and redeploy it. Its gateway `verify_jwt` is disabled because the primary and DRM projects issue different JWTs; manual primary-project authentication and authorization are mandatory and tested. It accepts GET only, plus CORS preflight. No secret or license hash is exposed to the browser.

License creation/rotation, IP resets, writes, and BuiltByBit sync continue through the licensing API so its transactional rules are preserved. In API mode, unsupported extra filters apply only to the current page and are labeled accordingly; native UUID filters retain collection scope. Supabase mode filters the complete dataset before pagination.

Optional fallback: if the public Edge connection is omitted, the dashboard server can read Supabase directly using server-only `DRM_SUPABASE_URL` and `DRM_SUPABASE_SECRET_KEY`, or use the licensing API. `DRM_READ_SOURCE` configures that server's default. Never give server credentials a `VITE_` prefix. Restart the dev server or redeploy after changing configuration.

The database adapter in `supabase/functions/admin-drm-read/drm-database.mjs` mirrors `server/drm-database.mjs`; a test checks that they match. Redeploy the function after adapter changes. Tests cover embedded Postgres permissions, read-only staff, disabled accounts, self-escalation attempts, API/database selection, safe column projections, and Edge authentication. Browser checks use mock users and records; no live customer records are used as write fixtures.

## Database-backed filters

Product filters use the actual `products.product_type` values and category names from `categories` (submitted as `category_id`). For example, **Minecraft Configs** selects its database UUID; **Minecraft Config** selects the exact product-type string. Neither is mapped to the old hardcoded `config` value. Other content filters load existing values too, and review product filters show product titles. Choices refresh when the collection is refreshed.

`workspace_filter_options` is an authenticated, page-authorized RPC. Its private helper exposes only the small ID/label lists needed by the caller's permitted page; staff can filter products without receiving category-management access. Database RLS still protects collection queries.

## Newsletter email studio

Recipients come exclusively from active rows (`is_active = true`) in the primary Supabase `newsletter_subscribers` table. Addresses are normalized and deduplicated before sending. No external mailing lists or email API keys are needed.

Supabase stores subscribers, permissions, automation settings and the durable email queue. [Supabase Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp) sends authentication messages; custom announcements use this application's server SMTP endpoint. You can copy the same SMTP provider credentials configured in Supabase Auth without resetting any existing API secrets.

Find your primary project key in [ZCraft Studios → Settings → API Keys](https://supabase.com/dashboard/project/esrjajilhtjdleheettk/settings/api-keys). Copy or create a secret key (`sb_secret_...`) and set `SUPABASE_SECRET_KEY` in `.env` and Vercel. This does not require resetting existing keys. Restart the local dev server after editing `.env`.

The studio includes editable Announcement, Maintenance, Alert, Product launch and Sale & offer templates matching the storefront’s paper background, ink header, mint/lime accents and typography. Personalize the subject, headline, message and button before applying a template; replacing an existing draft asks for confirmation. Email clients without the site fonts use safe fallback fonts. Applying a template never sends an email.

Configure server environment variables locally and on Vercel:

- `SUPABASE_SECRET_KEY`: primary project's server secret/service-role key.
- `SMTP_HOST`, `SMTP_PORT` (587 for STARTTLS, 465 for implicit TLS), `SMTP_USER`, `SMTP_PASSWORD`.
- `SMTP_FROM`: verified sender email; `SMTP_FROM_NAME`: optional sender name.
- `SMTP_RECIPIENT_LIMIT`: maximum recipients per message, default 100, maximum 1000. Keep within your provider's limit; larger audiences fail before sending, with no truncation.
- `PUBLIC_SITE_URL`: public website used in announcement links.
- `EMAIL_WORKER_SECRET`: optional worker authentication secret.

Keep all SMTP credentials and the Supabase secret server-only, without a `VITE_` prefix. Supabase does not expose your Auth SMTP password to this application, so SMTP credentials must be supplied explicitly.

Apply the email and newsletter subscriber migrations. Automation starts paused. The Email studio supports manual HTML/text emails, a sandboxed preview, a review step, and a test sent only to the signed-in user's address. Staff need email edit permission to test and manage permission to send or configure automation.

Automatic announcements are queued once when news, blog posts or products become published, or sales become active. Existing content is not backfilled. Scheduled announcements wait for their publish/start time; deleted or unpublished content is cancelled before submission.

For unattended delivery, schedule authenticated `POST /api/emails` with body `{"action":"process"}` and `Authorization: Bearer <EMAIL_WORKER_SECRET>`. An authenticated `GET /api/emails?action=process` also supports Vercel Cron's `CRON_SECRET`. No scheduler is installed automatically. Each call processes at most one due job, with a four-message hourly queue limit.

SMTP uses private BCC recipients and an explicit envelope. Messages include reply-to unsubscribe instructions; process these replies by deactivating the subscriber in Supabase. Submitted means SMTP acceptance, not confirmed delivery. Review the SMTP provider for delivery results. Timeouts and partial acceptance become uncertain and require manual reconciliation using the SMTP Message-ID, rather than an automatic resend. Failed jobs can be retried from the queue.

### BuiltByBit analytics

Open **Insights → BuiltByBit analytics** to select a metric, supported period, custom date range, and metric-specific filters. Periods use the shared list returned by BuiltByBit. The searchable product picker lists names and BBB IDs, supports multiple selections, and excludes unpublished drafts. Products with sales are shown by default; turn off “Products with sales only” to include published products with no purchases. The BBB token needs creator resource listing access; the synced DRM catalog is not used because it cannot verify publication status. Filters apply when you submit the form and remain applied on refresh. Graphs and total values use the corresponding BBB endpoints.

Set `BBB_API_TOKEN` in the server environment (local `.env` or hosting environment), using a BuiltByBit API token with analytics access. This token is never sent to the browser. Apply `supabase/migrations/20261002150000_bbb_analytics_permission.sql` to the primary workspace database to enable assigning the separate read-only **BuiltByBit analytics** permission to staff. Existing administrators retain access.

Reference: https://builtbybit.gitbook.io/api#get-v2-analytics
