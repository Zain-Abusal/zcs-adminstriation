# ZCraft administration

Separate Vite/React site in `admin/`, using the existing Supabase project, SQL tables, `has_role` RPC, and RLS policies. Imports the storefront's Button, Panel, Field, Eyebrow, Chip, SectionHeading, input styles, and ToastProvider directly. Vite deduplicates React so shared components use the admin app's React instance. Keep this folder inside the repository so those shared imports resolve.

## Run

Use Node 22.12+ (or a supported newer release):

```sh
cd admin
npm ci
cp .env.example .env.local
# Fill in the same Supabase URL and public/publishable key as the storefront.
npm run dev
```

Never put a service-role or secret key in frontend environment variables.

## Vercel

Create a **separate Vercel project** from this repository. Set Root Directory to `admin`, enable **Include source files outside of the Root Directory in the Build Step**, and select Vite. Install: `npm ci`; build: `npm run build`; output: `dist`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the desired environments, then deploy. The main site's Vercel configuration is unchanged.

For reduced discoverability, use a private hostname and enable Vercel Deployment Protection on all environments available to your plan. No public site links or sitemap entries are added. Robots.txt, HTML robots metadata, and X-Robots-Tag request no indexing. These directives are advisory: a publicly accessible login page cannot be guaranteed undiscoverable. Vercel protection restricts access to the shell itself; Supabase RLS protects database operations.

## Database and admin access

Use the existing database, not a second copy. Ensure the repository's existing migrations are applied, including `20260807130000_admin_panel_access.sql`, `20260807140000_fix_admin_roles_and_profiles.sql`, and `20260928135457_standalone_admin_access.sql`. The new migration grants news write privileges; the existing admin-only RLS policy still controls access. It has not been applied remotely by this change.

Create or invite the account through Supabase Auth, then grant its verified user ID the admin role in the trusted Supabase SQL editor:

```sql
insert into public.user_roles (user_id, role)
values ('REPLACE_WITH_AUTH_USER_UUID', 'admin')
on conflict (user_id, role) do nothing;
```

The app has password login only, no registration or self-promotion. Existing Supabase passwords work on this separate origin, but browser sessions are separate. Sessions use sessionStorage. Access is verified against Auth and `has_role` before loading or writing records and periodically while open. RLS remains the authoritative enforcement layer. Manage password resets/invites through Supabase Auth; no third-party auth or email bridge is introduced.

## Features

- Create, edit, and delete products, categories, media, services, pricing, promotions, coupons, blog posts, news, FAQs, legal pages, docs, changelog, team, reviews, licenses, and roles.
- Edit orders, request status/details, and newsletter subscriber records.
- Inspect profiles, order items, downloads, broadcasts, and analytics without write controls.
- Paginated records, current-page filtering, refresh, delete confirmation, save/error feedback.
- List storage folders and upload new product images or private product files. Copy the displayed storage path into product records; uploads do not overwrite existing files.
- SQL-aligned field editors: JSON arrays/objects, booleans, numeric fields, text and Markdown. Foreign keys use record UUIDs. Prices use cents. Blank new fields use database defaults; blank nullable existing fields become null.

Paid checkout remains the product's external marketplace URL. Changing a local order is not an external refund or payment operation. This app does not send broadcasts, manage Supabase infrastructure, or change auth account credentials. Public content changes follow the storefront's existing cache refresh behavior.

## Verification

`npm run build` runs strict TypeScript checks and the production build. `node --test tests/feedback.test.mjs` (Node 22.18+ or 24+) checks configuration validation and actionable login messages. Example environment values are rejected before login; connection failures show both an inline message and the shared error toast. Before production, verify with real test accounts: signed-out and non-admin users cannot enter; an admin can read/save a draft; revoked admin access fails; private uploads remain protected. Database write and role-revocation tests require configured credentials and have not been run against the live database.
