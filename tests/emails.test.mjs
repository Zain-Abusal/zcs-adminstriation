import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { announcement, emailHtml } from "../server/email-content.mjs";
import { handleEmails, validateMessage, processEmail } from "../server/emails.mjs";
const owner = "11111111-1111-4111-8111-111111111111",
  staff = "22222222-2222-4222-8222-222222222222";
const env = {
  VITE_SUPABASE_URL: "https://primary.example",
  VITE_SUPABASE_PUBLISHABLE_KEY: "public",
  SUPABASE_SECRET_KEY: "server-secret",
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "user",
  SMTP_PASSWORD: "secret",
  SMTP_FROM: "studio@example.com",
  EMAIL_WORKER_SECRET: "worker-secret",
};
const json = (value) => new Response(JSON.stringify(value), { status: 200 });
test("text email and automated templates escape content and preserve exact links", () => {
  assert.match(emailHtml('<script>&"', "text"), /&lt;script&gt;&amp;&quot;/);
  const message = announcement("product", {
    title: "<img onerror=x>",
    summary: "A & B",
    slug: "minecraft config",
  });
  assert.match(message.html, /&lt;img onerror=x&gt;/);
  assert.match(message.html, /A &amp; B/);
  assert.match(message.text, /\/products\/minecraft%20config/);
  assert.throws(() =>
    validateMessage({
      subject: "hello\nInjected",
      content: "text",
      format: "text",
      audience: "dashboard",
    }),
  );
  assert.throws(() =>
    validateMessage({ subject: "hello", content: "x", format: "script", audience: "dashboard" }),
  );
});
test("external audiences are rejected and missing audience defaults to subscribers", () => {
  const message = { subject: "Hello", content: "Body", format: "text" };
  assert.equal(validateMessage(message).audience, "dashboard");
  for (const audience of ["both", "sendpulse"]) assert.throws(() => validateMessage({ ...message, audience }), /newsletter subscribers/);
});
async function api(req, canAccess = true, customEnv = env) {
  let body, status;
  const calls = [];
  const res = {
    setHeader() {},
    end(value) {
      body = JSON.parse(value);
      status = this.statusCode;
    },
  };
  await handleEmails(
    { url: "/api/emails", method: "POST", headers: { authorization: "Bearer user-token" }, ...req },
    res,
    customEnv,
    {
      fetcher: async () => {
        throw new Error("No external requests expected");
      },
      makeDb: (url, key) => {
        calls.push(key);
        return {
          auth: {
            getUser: async () => ({ data: { user: { id: owner, email: "owner@example.com" } } }),
          },
          rpc: async () => ({ data: canAccess }),
        };
      },
    },
  );
  return { body, status, calls };
}
test("email API authenticates and authorizes before using server credentials", async () => {
  let r = await api({ headers: {}, body: { action: "manual" } });
  assert.equal(r.status, 401);
  assert.deepEqual(r.calls, []);
  r = await api({ body: { action: "manual" } }, false);
  assert.equal(r.status, 403);
  assert.deepEqual(r.calls, ["public"]);
  r = await api({ headers: { authorization: "Bearer worker-secret" }, body: { action: "manual" } });
  assert.equal(r.status, 403);
  assert.deepEqual(r.calls, []);
  r = await api({
    body: {
      action: "test",
      subject: "bad\nsubject",
      format: "text",
      content: "x",
      audience: "dashboard",
    },
  });
  assert.equal(r.status, 400);
});
test("database filters use actual values and publication queue deduplicates and enforces permissions", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema workspace_private;grant usage on schema public,auth,workspace_private to authenticated;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${staff}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function workspace_private.can_access(page_key text, action_key text default 'read') returns boolean language sql stable as $$ select auth.uid()='${owner}'::uuid or (auth.uid()='${staff}'::uuid and page_key='products' and action_key='read') $$;create table workspace_page_permissions(page text constraint workspace_page_key_check check(page in ('products')));create table categories(id uuid primary key default gen_random_uuid(),name text);create table products(id uuid primary key default gen_random_uuid(),title text,slug text,product_type text,category_id uuid,is_published boolean default false,published_at timestamptz default now());create table blog_posts(id uuid primary key default gen_random_uuid(),title text,slug text,is_published boolean default false,published_at timestamptz default now());create table news_entries(id uuid primary key default gen_random_uuid(),title text,kind text,is_published boolean default false,published_on timestamptz default now());create table sales(id uuid primary key default gen_random_uuid(),label text,starts_at timestamptz default now());create table sale_events(id uuid primary key default gen_random_uuid(),label text,is_active boolean default false,starts_at timestamptz default now());`,
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261002120320_sendpulse_email_and_database_filters.sql",
        "utf8",
      ),
    );
    await db.exec(readFileSync("supabase/migrations/" + readdirSync("supabase/migrations").find(name => name.endsWith("_newsletter_subscribers_only.sql")), "utf8"));
    assert.equal((await db.query("select audience from workspace_email_settings")).rows[0].audience, "dashboard");
    await db.exec(
      `insert into categories values('${owner}','Minecraft Configs');insert into products(id,title,product_type,category_id) values('${owner}','Config','Minecraft Config','${owner}');set role authenticated;set request.jwt.claim.sub='${staff}';`,
    );
    let result = await db.query(`select workspace_filter_options('products') as options`);
    assert.deepEqual(result.rows[0].options.category_id, [
      { value: owner, label: "Minecraft Configs" },
    ]);
    assert.deepEqual(result.rows[0].options.product_type, [
      { value: "Minecraft Config", label: "Minecraft Config" },
    ]);
    await assert.rejects(
      () => db.query(`select workspace_filter_options('newsletter_subscribers')`),
      /Page access required/,
    );
    await assert.rejects(
      () => db.query(`select * from workspace_claim_email()`),
      /permission denied/,
    );
    assert.equal((await db.query("select * from workspace_email_jobs")).rows.length, 0);
    await db.query("update workspace_email_settings set enabled=true");
    await db.exec("reset role");
    assert.equal(
      (await db.query("select enabled from workspace_email_settings")).rows[0].enabled,
      false,
    );
    await db.exec(
      `reset role;set request.jwt.claim.sub='${owner}';update workspace_email_settings set enabled=true;update products set is_published=true where id='${owner}';update products set title='Edited' where id='${owner}';update products set is_published=false where id='${owner}';update products set is_published=true where id='${owner}';`,
    );
    assert.equal((await db.query("select * from workspace_email_jobs")).rows.length, 1);
    await db.exec(
      `insert into blog_posts(title,is_published,published_at) values('Future',true,now()+interval '1 day');set role service_role;`,
    );
    result = await db.query("select * from workspace_claim_email()");
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].kind, "product");
    assert.equal((await db.query("select * from workspace_claim_email()")).rows.length, 0);
    await db.exec(
      `reset role;update workspace_email_jobs set started_at=now()-interval '11 minutes' where kind='product';set role service_role;`,
    );
    assert.equal((await db.query("select * from workspace_claim_email()")).rows.length, 0);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select status from workspace_email_jobs where kind='product'")).rows[0]
        .status,
      "uncertain",
    );
    await db.exec(
      `insert into workspace_email_jobs(kind,subject,request_key) values('manual','Manual','${owner}');`,
    );
    await assert.rejects(
      () =>
        db.exec(
          `insert into workspace_email_jobs(kind,subject,request_key) values('manual','Duplicate','${owner}');`,
        ),
      /duplicate key/,
    );
    await db.exec(
      `insert into workspace_email_jobs(kind,subject) select 'manual','Queue item' from generate_series(1,3);set role service_role;`,
    );
    for (let i = 0; i < 3; i++)
      assert.equal((await db.query("select * from workspace_claim_email()")).rows.length, 1);
    assert.equal((await db.query("select * from workspace_claim_email()")).rows.length, 0);
  } finally {
    await db.close();
  }
});
