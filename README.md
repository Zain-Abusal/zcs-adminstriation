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
