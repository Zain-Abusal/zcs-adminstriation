-- Filter choices expose only labels/IDs for pages the caller can read.
create or replace function workspace_private.filter_options(page_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare fields text[]; field_key text; result jsonb := '{}'; choices jsonb;
begin
 if auth.uid() is null or not workspace_private.can_access(page_key,'read') then raise exception 'Page access required' using errcode='42501'; end if;
 fields := case page_key
  when 'products' then array['product_type']
  when 'custom_requests' then array['work_type','budget_range']
  when 'orders' then array['provider']
  when 'homepage_reviews' then array['product_type']
  when 'news_entries' then array['kind']
  when 'docs_pages' then array['section']
  when 'faq_items' then array['category']
  when 'newsletter_subscribers' then array['source']
  when 'admin_security_events' then array['event_type']
  when 'broadcast_log' then array['kind']
  else array[]::text[] end;
 foreach field_key in array fields loop
  execute format('select coalesce(jsonb_agg(jsonb_build_object(''value'',v,''label'',v) order by v),''[]''::jsonb) from (select distinct %I::text v from public.%I where %I is not null and %I::text <> '''' limit 1000) x',field_key,page_key,field_key,field_key) into choices;
  result := result || jsonb_build_object(field_key,choices);
 end loop;
 if page_key='products' then
  select coalesce(jsonb_agg(jsonb_build_object('value',id,'label',name) order by name),'[]'::jsonb) into choices from public.categories;
  result := result || jsonb_build_object('category_id',choices);
 elsif page_key='reviews' then
  select coalesce(jsonb_agg(jsonb_build_object('value',id,'label',title) order by title),'[]'::jsonb) into choices from public.products;
  result := result || jsonb_build_object('product_id',choices);
 end if;
 return result;
end $$;
revoke all on function workspace_private.filter_options(text) from public,anon;
grant execute on function workspace_private.filter_options(text) to authenticated;
create or replace function public.workspace_filter_options(page_key text)
returns jsonb language sql stable security invoker set search_path='' as $$ select workspace_private.filter_options(page_key) $$;
revoke all on function public.workspace_filter_options(text) from public,anon;
grant execute on function public.workspace_filter_options(text) to authenticated;

-- Add an independent page permission for composing and managing broadcasts.
alter table public.workspace_page_permissions drop constraint workspace_page_key_check;
alter table public.workspace_page_permissions add constraint workspace_page_key_check check (page in ('orders','products','custom_requests','blog_posts','news_entries','docs_pages','faq_items','legal_pages','team_members','blog_media','services','pricing_plans','categories','sales','sale_events','sale_entries','homepage_reviews','reviews','newsletter_subscribers','page_view_daily','blog_reads','broadcast_log','admin_security_events','site_settings','user_roles','overview','storage','ziina','drm_products','drm_customers','drm_licenses','drm_validations','drm_requests','drm_audit','drm_sync','emails'));
create table public.workspace_email_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 news boolean not null default true,
 blog boolean not null default true,
 product boolean not null default true,
 sale boolean not null default true,
 audience text not null default 'both' check(audience in ('dashboard','sendpulse','both')),
 updated_at timestamptz not null default now()
);
insert into public.workspace_email_settings(id) values(true);
alter table public.workspace_email_settings enable row level security;
grant select,update on public.workspace_email_settings to authenticated;
grant all on public.workspace_email_settings to service_role;
create policy email_settings_read on public.workspace_email_settings for select to authenticated using (workspace_private.can_access('emails','read'));
create policy email_settings_update on public.workspace_email_settings for update to authenticated using (workspace_private.can_access('emails','manage')) with check(workspace_private.can_access('emails','manage'));

create table public.workspace_email_jobs (
 id uuid primary key default gen_random_uuid(),
 request_key uuid unique,
 kind text not null check(kind in ('news','blog','product','sale','discount','manual')),
 ref_id uuid,
 subject text not null check(length(subject) between 1 and 200),
 content text not null default '' check(octet_length(content) <= 204800),
 format text not null default 'text' check(format in ('html','text')),
 audience text not null default 'both' check(audience in ('dashboard','sendpulse','both')),
 status text not null default 'queued' check(status in ('queued','processing','submitted','failed','uncertain','cancelled')),
 available_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 started_at timestamptz,
 submitted_at timestamptz,
 provider_id text,
 last_error text,
 attempts integer not null default 0,
 created_by uuid references auth.users(id) on delete set null,
 unique(kind,ref_id)
);
create index email_jobs_pending on public.workspace_email_jobs(available_at,created_at) where status='queued';
create index email_jobs_started on public.workspace_email_jobs(started_at) where started_at is not null;
alter table public.workspace_email_jobs enable row level security;
grant select on public.workspace_email_jobs to authenticated;
grant all on public.workspace_email_jobs to service_role;
create policy email_jobs_read on public.workspace_email_jobs for select to authenticated using(workspace_private.can_access('emails','read'));

-- Trigger only queues; provider credentials and HTTP delivery remain server-side.
create or replace function workspace_private.queue_announcement()
returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb := to_jsonb(new); previous jsonb; kind_key text; settings public.workspace_email_settings; live boolean; due timestamptz;
begin
 kind_key := case tg_table_name when 'news_entries' then 'news' when 'blog_posts' then 'blog' when 'products' then 'product' when 'sale_events' then 'sale' when 'sales' then 'discount' end;
 select * into settings from public.workspace_email_settings where id;
 if not settings.enabled or not (to_jsonb(settings)->>case when kind_key='discount' then 'sale' else kind_key end)::boolean then return new; end if;
 live := kind_key='discount' or coalesce((item->>case when kind_key='sale' then 'is_active' else 'is_published' end)::boolean,false);
 if not live then return new; end if;
 if tg_op='UPDATE' then
  if kind_key='discount' then return new; end if;
  previous := to_jsonb(old);
  if coalesce((previous->>case when kind_key='sale' then 'is_active' else 'is_published' end)::boolean,false) then return new; end if;
 end if;
 due := coalesce((item->>case when kind_key in ('sale','discount') then 'starts_at' when kind_key='news' then 'published_on' else 'published_at' end)::timestamptz,now());
 insert into public.workspace_email_jobs(kind,ref_id,subject,audience,available_at,created_by)
 values(kind_key,new.id,left(coalesce(item->>'title',item->>'label','Studio update'),200),settings.audience,greatest(due,now()),auth.uid())
 on conflict(kind,ref_id) do nothing;
 return new;
end $$;
revoke all on function workspace_private.queue_announcement() from public,anon,authenticated;
create trigger queue_news_email after insert or update of is_published on public.news_entries for each row execute function workspace_private.queue_announcement();
create trigger queue_blog_email after insert or update of is_published on public.blog_posts for each row execute function workspace_private.queue_announcement();
create trigger queue_product_email after insert or update of is_published on public.products for each row execute function workspace_private.queue_announcement();
create trigger queue_discount_email after insert on public.sales for each row execute function workspace_private.queue_announcement();
create trigger queue_sale_email after insert or update of is_active on public.sale_events for each row execute function workspace_private.queue_announcement();

-- A serialized claim prevents concurrent workers from submitting the same job.
-- Ambiguous provider responses are held for review, never automatically resent.
create or replace function workspace_private.claim_email(target_id uuid default null)
returns setof public.workspace_email_jobs language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(82647193);
 update public.workspace_email_jobs set status='uncertain',last_error='Worker interrupted. Check SendPulse before retrying.' where status='processing' and started_at < now()-interval '10 minutes';
 if (select count(*) from public.workspace_email_jobs where started_at > now()-interval '1 hour') >= 4 then return; end if;
 return query update public.workspace_email_jobs set status='processing',started_at=now(),attempts=attempts+1,last_error=null
 where id=(select j.id from public.workspace_email_jobs j where j.status='queued' and j.available_at<=now() and (target_id is null or j.id=target_id) and (j.kind='manual' or (select enabled and (to_jsonb(s)->>case when j.kind='discount' then 'sale' else j.kind end)::boolean from public.workspace_email_settings s where s.id)) order by j.available_at,j.created_at for update skip locked limit 1)
 returning *;
end $$;
revoke all on function workspace_private.claim_email(uuid) from public,anon,authenticated;
grant usage on schema workspace_private to service_role;
grant execute on function workspace_private.claim_email(uuid) to service_role;
create or replace function public.workspace_claim_email(target_id uuid default null)
returns setof public.workspace_email_jobs language sql security invoker set search_path='' as $$ select * from workspace_private.claim_email(target_id) $$;
revoke all on function public.workspace_claim_email(uuid) from public,anon,authenticated;
grant execute on function public.workspace_claim_email(uuid) to service_role;
