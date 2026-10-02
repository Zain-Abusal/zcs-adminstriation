import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { permits } from "../src/access-model.ts";
const owner = "11111111-1111-4111-8111-111111111111",
  staff = "22222222-2222-4222-8222-222222222222";
test("permission levels reject disabled access and prevent delegated owner powers", () => {
  const a = {
    admin: false,
    enabled: true,
    grants: { orders: "read", products: "edit", drm_licenses: "manage", staff: "manage" },
  };
  assert.equal(permits(a, "orders"), true);
  assert.equal(permits(a, "orders", "edit"), false);
  assert.equal(permits(a, "products", "edit"), true);
  assert.equal(permits(a, "products", "manage"), false);
  assert.equal(permits(a, "drm_licenses", "manage"), true);
  assert.equal(permits(a, "staff"), false);
  assert.equal(permits({ ...a, enabled: false }, "products"), false);
});
test("real Postgres RLS enforces staff permissions, transactional grants, and audit", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role service_role; create role anon; create role authenticated; create schema auth; create schema storage; grant usage on schema public,auth,storage to authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create table public.user_roles(user_id uuid,role text); insert into auth.users values('${owner}'),('${staff}'); insert into user_roles values('${owner}','admin'); create function public.has_role(_user_id uuid,_role text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$; create table storage.objects(id uuid default gen_random_uuid(),bucket_id text);alter table storage.objects enable row level security; grant select,insert,update,delete on storage.objects to authenticated;`,
    );
    const migration = readFileSync(
      `supabase/migrations/${readdirSync("supabase/migrations").find((n) => n.endsWith("_staff_page_permissions.sql"))}`,
      "utf8",
    );
    const tables = [
      ...new Set(
        [...migration.matchAll(/create policy workspace_read on public\.([a-z_]+)/g)].map(
          (m) => m[1],
        ),
      ),
    ];
    for (const table of tables)
      await db.exec(
        `create table public.${table}(id uuid primary key default gen_random_uuid(),title text default 'record', actor_user_id uuid);alter table public.${table} enable row level security;`,
      );
    // Simulate pre-existing permissive policies which must not bypass staff write restrictions.
    await db.exec(
      `grant all on public.products to authenticated;create policy legacy_open_write on products for all to authenticated using(true) with check(true);alter table user_roles enable row level security;grant all on user_roles to authenticated;create policy owner_roles on user_roles for all to authenticated using(public.has_role(auth.uid(),'admin')) with check(public.has_role(auth.uid(),'admin'));`,
    );
    await db.exec(migration);
    await db.exec(
      "create function public.prune_analytics() returns void language sql security definer as $$delete from products$$;",
    );
    const hardening = readFileSync(
      `supabase/migrations/${readdirSync("supabase/migrations").find((n) => n.endsWith("_staff_permission_hardening.sql"))}`,
      "utf8",
    );
    await db.exec(hardening);
    await db.exec(
      readFileSync("supabase/migrations/20261002150000_bbb_analytics_permission.sql", "utf8"),
    );
    async function as(user) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.exec("set role authenticated");
    }
    async function save(grants, enabled = true) {
      await as(owner);
      await db.query("select public.workspace_save_member($1,$2,$3,$4::jsonb)", [
        staff,
        "Test staff",
        enabled,
        JSON.stringify(grants),
      ]);
      await as(staff);
    }
    await save({ products: "read", orders: "edit", drm_requests: "read", bbb_analytics: "read" });
    assert.equal(
      (await db.query("select public.workspace_can_access('bbb_analytics','read') as allowed"))
        .rows[0].allowed,
      true,
    );
    assert.equal(
      (await db.query("select public.workspace_can_access('bbb_analytics','edit') as allowed"))
        .rows[0].allowed,
      false,
    );
    assert.equal(
      (await db.query("select public.workspace_can_access('products','read') as allowed")).rows[0]
        .allowed,
      true,
    );
    await assert.rejects(
      db.exec("insert into products(title) values('forbidden')"),
      /row-level security/,
    );
    await db.exec("insert into orders(title) values('allowed')");
    assert.equal((await db.query("delete from orders returning id")).rows.length, 0);
    await assert.rejects(
      db.query("select public.workspace_save_member($1,$2,$3,$4::jsonb)", [
        staff,
        "Escalated",
        true,
        '{"products":"manage"}',
      ]),
      /Owner access/,
    );
    await assert.rejects(
      db.exec(`insert into user_roles values('${staff}','admin')`),
      /row-level security/,
    );
    await assert.rejects(db.exec("select public.prune_analytics()"), /permission denied/);
    await save({ products: "edit" });
    await db.exec("insert into products(title) values('allowed')");
    assert.equal((await db.query("delete from products returning id")).rows.length, 0);
    await save({ products: "manage" });
    assert.equal((await db.query("delete from products returning id")).rows.length, 1);
    await save({ products: "manage" }, false);
    assert.equal(
      (await db.query("select public.workspace_can_access('products','read') as allowed")).rows[0]
        .allowed,
      false,
    );
    await assert.rejects(
      db.exec("insert into products(title) values('disabled')"),
      /row-level security/,
    );
    await as(owner);
    await assert.rejects(
      db.query("select public.workspace_save_member($1,$2,$3,$4::jsonb)", [
        staff,
        "Invalid",
        true,
        '{"unknown_page":"manage"}',
      ]),
      /workspace_page_key_check/,
    );
    const previous = await db.query("select enabled from workspace_members where user_id=$1", [
      staff,
    ]);
    assert.equal(previous.rows[0].enabled, false);
    assert.ok((await db.query("select * from workspace_permission_audit")).rows.length > 0);
    await as(staff);
    assert.equal((await db.query("select * from workspace_permission_audit")).rows.length, 0);
  } finally {
    await db.close();
  }
});
