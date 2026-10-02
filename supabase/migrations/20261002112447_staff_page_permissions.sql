begin;
create schema if not exists workspace_private;
revoke all on schema workspace_private from public;
grant usage on schema workspace_private to authenticated;
create table if not exists public.workspace_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 200),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.workspace_page_permissions (
  user_id uuid not null references public.workspace_members(user_id) on delete cascade,
  page text not null,
  access text not null check (access in ('none','read','edit','manage')),
  primary key(user_id,page)
);
create table if not exists public.workspace_permission_audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid,
  subject_id uuid not null, action text not null, details jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.workspace_members enable row level security;
alter table public.workspace_page_permissions enable row level security;
alter table public.workspace_permission_audit enable row level security;
revoke all on public.workspace_members, public.workspace_page_permissions, public.workspace_permission_audit from anon, authenticated;
grant select,insert,update,delete on public.workspace_members, public.workspace_page_permissions to authenticated;
grant select on public.workspace_permission_audit to authenticated;
create policy workspace_members_read on public.workspace_members for select to authenticated using (user_id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy workspace_members_manage on public.workspace_members for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy workspace_permissions_read on public.workspace_page_permissions for select to authenticated using (user_id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy workspace_permissions_manage on public.workspace_page_permissions for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy workspace_audit_read on public.workspace_permission_audit for select to authenticated using (public.has_role(auth.uid(),'admin'));
-- This narrow definer helper prevents recursive RLS checks on permission tables.
-- It always uses the caller's auth.uid(); callers cannot select another identity.
create or replace function workspace_private.can_access(page_key text, action_key text default 'read')
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and action_key in ('read','edit','manage') and (
  public.has_role(auth.uid(),'admin') or (
   page_key not in ('staff','user_roles') and exists (
    select 1 from public.workspace_members m join public.workspace_page_permissions p on p.user_id=m.user_id
    where m.user_id=auth.uid() and m.enabled and p.page=page_key
    and case p.access when 'manage' then 3 when 'edit' then 2 when 'read' then 1 else 0 end
     >= case action_key when 'manage' then 3 when 'edit' then 2 else 1 end
   )
  )
 );
$$;
revoke all on function workspace_private.can_access(text,text) from public,anon;
grant execute on function workspace_private.can_access(text,text) to authenticated;
create or replace function public.workspace_can_access(page_key text, action_key text default 'read')
returns boolean language sql stable security invoker set search_path = '' as $$
 select workspace_private.can_access(page_key,action_key);
$$;
revoke all on function public.workspace_can_access(text,text) from public,anon;
grant execute on function public.workspace_can_access(text,text) to authenticated;
create or replace function workspace_private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.workspace_members where user_id=auth.uid()) and not public.has_role(auth.uid(),'admin');
$$;
revoke all on function workspace_private.is_staff() from public,anon;
grant execute on function workspace_private.is_staff() to authenticated;
create or replace function public.workspace_access_context()
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object('admin', public.has_role(auth.uid(),'admin'),
  'enabled',coalesce((select enabled from public.workspace_members where user_id=auth.uid()),false),
  'grants',coalesce((select jsonb_object_agg(page,access) from public.workspace_page_permissions where user_id=auth.uid()),'{}'::jsonb));
$$;
revoke all on function public.workspace_access_context() from public,anon;
grant execute on function public.workspace_access_context() to authenticated;
create or replace function workspace_private.audit_permission_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.workspace_permission_audit(actor_id,subject_id,action,details)
 values(auth.uid(),coalesce(new.user_id,old.user_id),tg_table_name || ':' || tg_op,
 jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)));
 return coalesce(new,old);
end;
$$;
revoke all on function workspace_private.audit_permission_change() from public,anon,authenticated;
create trigger workspace_member_audit after insert or update or delete on public.workspace_members for each row execute function workspace_private.audit_permission_change();
create trigger workspace_grant_audit after insert or update or delete on public.workspace_page_permissions for each row execute function workspace_private.audit_permission_change();
create or replace function public.workspace_save_member(target_id uuid, member_name text, member_enabled boolean, page_grants jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
 if not public.has_role(auth.uid(),'admin') then raise exception 'Owner access required' using errcode='42501'; end if;
 if jsonb_typeof(page_grants) <> 'object' or length(page_grants::text)>16000 then raise exception 'Invalid permissions'; end if;
 insert into public.workspace_members(user_id,display_name,enabled,updated_at) values(target_id,member_name,member_enabled,now())
 on conflict(user_id) do update set display_name=excluded.display_name, enabled=excluded.enabled,updated_at=excluded.updated_at;
 delete from public.workspace_page_permissions where user_id=target_id;
 insert into public.workspace_page_permissions(user_id,page,access) select target_id,key,value from jsonb_each_text(page_grants);
end;
$$;
revoke all on function public.workspace_save_member(uuid,text,boolean,jsonb) from public,anon;
grant execute on function public.workspace_save_member(uuid,text,boolean,jsonb) to authenticated;
-- Close existing unrestricted dashboard writes before granting staff access.
drop policy if exists "homepage reviews dashboard insert" on public.homepage_reviews;
drop policy if exists "homepage reviews dashboard update" on public.homepage_reviews;
drop policy if exists "homepage reviews dashboard delete" on public.homepage_reviews;
drop policy if exists "Enable insert for authenticated users only" on public.orders;
alter table public.workspace_page_permissions add constraint workspace_page_key_check check (page in ('orders','products','custom_requests','blog_posts','news_entries','docs_pages','faq_items','legal_pages','team_members','blog_media','services','pricing_plans','categories','sales','sale_events','sale_entries','homepage_reviews','reviews','newsletter_subscribers','page_view_daily','blog_reads','broadcast_log','admin_security_events','site_settings','user_roles','overview','storage','ziina','drm_products','drm_customers','drm_licenses','drm_validations','drm_requests','drm_audit','drm_sync'));
grant select on public.orders to authenticated;
create policy workspace_read on public.orders for select to authenticated using (workspace_private.can_access('orders','read'));
grant insert on public.orders to authenticated;
create policy workspace_insert on public.orders for insert to authenticated with check (workspace_private.can_access('orders','edit'));
create policy workspace_staff_guard_insert on public.orders as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('orders','edit'));
grant update on public.orders to authenticated;
create policy workspace_update on public.orders for update to authenticated using (workspace_private.can_access('orders','edit')) with check (workspace_private.can_access('orders','edit'));
create policy workspace_staff_guard_update on public.orders as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('orders','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('orders','edit'));
grant delete on public.orders to authenticated;
create policy workspace_delete on public.orders for delete to authenticated using (workspace_private.can_access('orders','manage'));
create policy workspace_staff_guard_delete on public.orders as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('orders','manage'));
grant select on public.products to authenticated;
create policy workspace_read on public.products for select to authenticated using (workspace_private.can_access('products','read'));
grant insert on public.products to authenticated;
create policy workspace_insert on public.products for insert to authenticated with check (workspace_private.can_access('products','edit'));
create policy workspace_staff_guard_insert on public.products as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('products','edit'));
grant update on public.products to authenticated;
create policy workspace_update on public.products for update to authenticated using (workspace_private.can_access('products','edit')) with check (workspace_private.can_access('products','edit'));
create policy workspace_staff_guard_update on public.products as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('products','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('products','edit'));
grant delete on public.products to authenticated;
create policy workspace_delete on public.products for delete to authenticated using (workspace_private.can_access('products','manage'));
create policy workspace_staff_guard_delete on public.products as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('products','manage'));
grant select on public.custom_requests to authenticated;
create policy workspace_read on public.custom_requests for select to authenticated using (workspace_private.can_access('custom_requests','read'));
grant update on public.custom_requests to authenticated;
create policy workspace_update on public.custom_requests for update to authenticated using (workspace_private.can_access('custom_requests','edit')) with check (workspace_private.can_access('custom_requests','edit'));
create policy workspace_staff_guard_update on public.custom_requests as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('custom_requests','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('custom_requests','edit'));
grant select on public.blog_posts to authenticated;
create policy workspace_read on public.blog_posts for select to authenticated using (workspace_private.can_access('blog_posts','read'));
grant insert on public.blog_posts to authenticated;
create policy workspace_insert on public.blog_posts for insert to authenticated with check (workspace_private.can_access('blog_posts','edit'));
create policy workspace_staff_guard_insert on public.blog_posts as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('blog_posts','edit'));
grant update on public.blog_posts to authenticated;
create policy workspace_update on public.blog_posts for update to authenticated using (workspace_private.can_access('blog_posts','edit')) with check (workspace_private.can_access('blog_posts','edit'));
create policy workspace_staff_guard_update on public.blog_posts as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('blog_posts','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('blog_posts','edit'));
grant delete on public.blog_posts to authenticated;
create policy workspace_delete on public.blog_posts for delete to authenticated using (workspace_private.can_access('blog_posts','manage'));
create policy workspace_staff_guard_delete on public.blog_posts as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('blog_posts','manage'));
grant select on public.news_entries to authenticated;
create policy workspace_read on public.news_entries for select to authenticated using (workspace_private.can_access('news_entries','read'));
grant insert on public.news_entries to authenticated;
create policy workspace_insert on public.news_entries for insert to authenticated with check (workspace_private.can_access('news_entries','edit'));
create policy workspace_staff_guard_insert on public.news_entries as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('news_entries','edit'));
grant update on public.news_entries to authenticated;
create policy workspace_update on public.news_entries for update to authenticated using (workspace_private.can_access('news_entries','edit')) with check (workspace_private.can_access('news_entries','edit'));
create policy workspace_staff_guard_update on public.news_entries as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('news_entries','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('news_entries','edit'));
grant delete on public.news_entries to authenticated;
create policy workspace_delete on public.news_entries for delete to authenticated using (workspace_private.can_access('news_entries','manage'));
create policy workspace_staff_guard_delete on public.news_entries as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('news_entries','manage'));
grant select on public.docs_pages to authenticated;
create policy workspace_read on public.docs_pages for select to authenticated using (workspace_private.can_access('docs_pages','read'));
grant insert on public.docs_pages to authenticated;
create policy workspace_insert on public.docs_pages for insert to authenticated with check (workspace_private.can_access('docs_pages','edit'));
create policy workspace_staff_guard_insert on public.docs_pages as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('docs_pages','edit'));
grant update on public.docs_pages to authenticated;
create policy workspace_update on public.docs_pages for update to authenticated using (workspace_private.can_access('docs_pages','edit')) with check (workspace_private.can_access('docs_pages','edit'));
create policy workspace_staff_guard_update on public.docs_pages as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('docs_pages','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('docs_pages','edit'));
grant delete on public.docs_pages to authenticated;
create policy workspace_delete on public.docs_pages for delete to authenticated using (workspace_private.can_access('docs_pages','manage'));
create policy workspace_staff_guard_delete on public.docs_pages as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('docs_pages','manage'));
grant select on public.faq_items to authenticated;
create policy workspace_read on public.faq_items for select to authenticated using (workspace_private.can_access('faq_items','read'));
grant insert on public.faq_items to authenticated;
create policy workspace_insert on public.faq_items for insert to authenticated with check (workspace_private.can_access('faq_items','edit'));
create policy workspace_staff_guard_insert on public.faq_items as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('faq_items','edit'));
grant update on public.faq_items to authenticated;
create policy workspace_update on public.faq_items for update to authenticated using (workspace_private.can_access('faq_items','edit')) with check (workspace_private.can_access('faq_items','edit'));
create policy workspace_staff_guard_update on public.faq_items as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('faq_items','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('faq_items','edit'));
grant delete on public.faq_items to authenticated;
create policy workspace_delete on public.faq_items for delete to authenticated using (workspace_private.can_access('faq_items','manage'));
create policy workspace_staff_guard_delete on public.faq_items as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('faq_items','manage'));
grant select on public.legal_pages to authenticated;
create policy workspace_read on public.legal_pages for select to authenticated using (workspace_private.can_access('legal_pages','read'));
grant insert on public.legal_pages to authenticated;
create policy workspace_insert on public.legal_pages for insert to authenticated with check (workspace_private.can_access('legal_pages','edit'));
create policy workspace_staff_guard_insert on public.legal_pages as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('legal_pages','edit'));
grant update on public.legal_pages to authenticated;
create policy workspace_update on public.legal_pages for update to authenticated using (workspace_private.can_access('legal_pages','edit')) with check (workspace_private.can_access('legal_pages','edit'));
create policy workspace_staff_guard_update on public.legal_pages as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('legal_pages','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('legal_pages','edit'));
grant delete on public.legal_pages to authenticated;
create policy workspace_delete on public.legal_pages for delete to authenticated using (workspace_private.can_access('legal_pages','manage'));
create policy workspace_staff_guard_delete on public.legal_pages as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('legal_pages','manage'));
grant select on public.team_members to authenticated;
create policy workspace_read on public.team_members for select to authenticated using (workspace_private.can_access('team_members','read'));
grant insert on public.team_members to authenticated;
create policy workspace_insert on public.team_members for insert to authenticated with check (workspace_private.can_access('team_members','edit'));
create policy workspace_staff_guard_insert on public.team_members as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('team_members','edit'));
grant update on public.team_members to authenticated;
create policy workspace_update on public.team_members for update to authenticated using (workspace_private.can_access('team_members','edit')) with check (workspace_private.can_access('team_members','edit'));
create policy workspace_staff_guard_update on public.team_members as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('team_members','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('team_members','edit'));
grant delete on public.team_members to authenticated;
create policy workspace_delete on public.team_members for delete to authenticated using (workspace_private.can_access('team_members','manage'));
create policy workspace_staff_guard_delete on public.team_members as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('team_members','manage'));
grant select on public.blog_media to authenticated;
create policy workspace_read on public.blog_media for select to authenticated using (workspace_private.can_access('blog_media','read'));
grant insert on public.blog_media to authenticated;
create policy workspace_insert on public.blog_media for insert to authenticated with check (workspace_private.can_access('blog_media','edit'));
create policy workspace_staff_guard_insert on public.blog_media as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('blog_media','edit'));
grant update on public.blog_media to authenticated;
create policy workspace_update on public.blog_media for update to authenticated using (workspace_private.can_access('blog_media','edit')) with check (workspace_private.can_access('blog_media','edit'));
create policy workspace_staff_guard_update on public.blog_media as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('blog_media','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('blog_media','edit'));
grant delete on public.blog_media to authenticated;
create policy workspace_delete on public.blog_media for delete to authenticated using (workspace_private.can_access('blog_media','manage'));
create policy workspace_staff_guard_delete on public.blog_media as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('blog_media','manage'));
grant select on public.services to authenticated;
create policy workspace_read on public.services for select to authenticated using (workspace_private.can_access('services','read'));
grant insert on public.services to authenticated;
create policy workspace_insert on public.services for insert to authenticated with check (workspace_private.can_access('services','edit'));
create policy workspace_staff_guard_insert on public.services as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('services','edit'));
grant update on public.services to authenticated;
create policy workspace_update on public.services for update to authenticated using (workspace_private.can_access('services','edit')) with check (workspace_private.can_access('services','edit'));
create policy workspace_staff_guard_update on public.services as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('services','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('services','edit'));
grant delete on public.services to authenticated;
create policy workspace_delete on public.services for delete to authenticated using (workspace_private.can_access('services','manage'));
create policy workspace_staff_guard_delete on public.services as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('services','manage'));
grant select on public.pricing_plans to authenticated;
create policy workspace_read on public.pricing_plans for select to authenticated using (workspace_private.can_access('pricing_plans','read'));
grant insert on public.pricing_plans to authenticated;
create policy workspace_insert on public.pricing_plans for insert to authenticated with check (workspace_private.can_access('pricing_plans','edit'));
create policy workspace_staff_guard_insert on public.pricing_plans as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('pricing_plans','edit'));
grant update on public.pricing_plans to authenticated;
create policy workspace_update on public.pricing_plans for update to authenticated using (workspace_private.can_access('pricing_plans','edit')) with check (workspace_private.can_access('pricing_plans','edit'));
create policy workspace_staff_guard_update on public.pricing_plans as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('pricing_plans','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('pricing_plans','edit'));
grant delete on public.pricing_plans to authenticated;
create policy workspace_delete on public.pricing_plans for delete to authenticated using (workspace_private.can_access('pricing_plans','manage'));
create policy workspace_staff_guard_delete on public.pricing_plans as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('pricing_plans','manage'));
grant select on public.categories to authenticated;
create policy workspace_read on public.categories for select to authenticated using (workspace_private.can_access('categories','read'));
grant insert on public.categories to authenticated;
create policy workspace_insert on public.categories for insert to authenticated with check (workspace_private.can_access('categories','edit'));
create policy workspace_staff_guard_insert on public.categories as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('categories','edit'));
grant update on public.categories to authenticated;
create policy workspace_update on public.categories for update to authenticated using (workspace_private.can_access('categories','edit')) with check (workspace_private.can_access('categories','edit'));
create policy workspace_staff_guard_update on public.categories as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('categories','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('categories','edit'));
grant delete on public.categories to authenticated;
create policy workspace_delete on public.categories for delete to authenticated using (workspace_private.can_access('categories','manage'));
create policy workspace_staff_guard_delete on public.categories as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('categories','manage'));
grant select on public.sales to authenticated;
create policy workspace_read on public.sales for select to authenticated using (workspace_private.can_access('sales','read'));
grant insert on public.sales to authenticated;
create policy workspace_insert on public.sales for insert to authenticated with check (workspace_private.can_access('sales','edit'));
create policy workspace_staff_guard_insert on public.sales as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('sales','edit'));
grant update on public.sales to authenticated;
create policy workspace_update on public.sales for update to authenticated using (workspace_private.can_access('sales','edit')) with check (workspace_private.can_access('sales','edit'));
create policy workspace_staff_guard_update on public.sales as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('sales','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('sales','edit'));
grant delete on public.sales to authenticated;
create policy workspace_delete on public.sales for delete to authenticated using (workspace_private.can_access('sales','manage'));
create policy workspace_staff_guard_delete on public.sales as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('sales','manage'));
grant select on public.sale_events to authenticated;
create policy workspace_read on public.sale_events for select to authenticated using (workspace_private.can_access('sale_events','read'));
grant insert on public.sale_events to authenticated;
create policy workspace_insert on public.sale_events for insert to authenticated with check (workspace_private.can_access('sale_events','edit'));
create policy workspace_staff_guard_insert on public.sale_events as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('sale_events','edit'));
grant update on public.sale_events to authenticated;
create policy workspace_update on public.sale_events for update to authenticated using (workspace_private.can_access('sale_events','edit')) with check (workspace_private.can_access('sale_events','edit'));
create policy workspace_staff_guard_update on public.sale_events as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('sale_events','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('sale_events','edit'));
grant delete on public.sale_events to authenticated;
create policy workspace_delete on public.sale_events for delete to authenticated using (workspace_private.can_access('sale_events','manage'));
create policy workspace_staff_guard_delete on public.sale_events as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('sale_events','manage'));
grant select on public.sale_entries to authenticated;
create policy workspace_read on public.sale_entries for select to authenticated using (workspace_private.can_access('sale_entries','read'));
grant insert on public.sale_entries to authenticated;
create policy workspace_insert on public.sale_entries for insert to authenticated with check (workspace_private.can_access('sale_entries','edit'));
create policy workspace_staff_guard_insert on public.sale_entries as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('sale_entries','edit'));
grant update on public.sale_entries to authenticated;
create policy workspace_update on public.sale_entries for update to authenticated using (workspace_private.can_access('sale_entries','edit')) with check (workspace_private.can_access('sale_entries','edit'));
create policy workspace_staff_guard_update on public.sale_entries as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('sale_entries','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('sale_entries','edit'));
grant delete on public.sale_entries to authenticated;
create policy workspace_delete on public.sale_entries for delete to authenticated using (workspace_private.can_access('sale_entries','manage'));
create policy workspace_staff_guard_delete on public.sale_entries as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('sale_entries','manage'));
grant select on public.homepage_reviews to authenticated;
create policy workspace_read on public.homepage_reviews for select to authenticated using (workspace_private.can_access('homepage_reviews','read'));
grant insert on public.homepage_reviews to authenticated;
create policy workspace_insert on public.homepage_reviews for insert to authenticated with check (workspace_private.can_access('homepage_reviews','edit'));
create policy workspace_staff_guard_insert on public.homepage_reviews as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('homepage_reviews','edit'));
grant update on public.homepage_reviews to authenticated;
create policy workspace_update on public.homepage_reviews for update to authenticated using (workspace_private.can_access('homepage_reviews','edit')) with check (workspace_private.can_access('homepage_reviews','edit'));
create policy workspace_staff_guard_update on public.homepage_reviews as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('homepage_reviews','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('homepage_reviews','edit'));
grant delete on public.homepage_reviews to authenticated;
create policy workspace_delete on public.homepage_reviews for delete to authenticated using (workspace_private.can_access('homepage_reviews','manage'));
create policy workspace_staff_guard_delete on public.homepage_reviews as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('homepage_reviews','manage'));
grant select on public.reviews to authenticated;
create policy workspace_read on public.reviews for select to authenticated using (workspace_private.can_access('reviews','read'));
grant insert on public.reviews to authenticated;
create policy workspace_insert on public.reviews for insert to authenticated with check (workspace_private.can_access('reviews','edit'));
create policy workspace_staff_guard_insert on public.reviews as restrictive for insert to authenticated with check (not workspace_private.is_staff() or workspace_private.can_access('reviews','edit'));
grant update on public.reviews to authenticated;
create policy workspace_update on public.reviews for update to authenticated using (workspace_private.can_access('reviews','edit')) with check (workspace_private.can_access('reviews','edit'));
create policy workspace_staff_guard_update on public.reviews as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('reviews','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('reviews','edit'));
grant delete on public.reviews to authenticated;
create policy workspace_delete on public.reviews for delete to authenticated using (workspace_private.can_access('reviews','manage'));
create policy workspace_staff_guard_delete on public.reviews as restrictive for delete to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('reviews','manage'));
grant select on public.newsletter_subscribers to authenticated;
create policy workspace_read on public.newsletter_subscribers for select to authenticated using (workspace_private.can_access('newsletter_subscribers','read'));
grant update on public.newsletter_subscribers to authenticated;
create policy workspace_update on public.newsletter_subscribers for update to authenticated using (workspace_private.can_access('newsletter_subscribers','edit')) with check (workspace_private.can_access('newsletter_subscribers','edit'));
create policy workspace_staff_guard_update on public.newsletter_subscribers as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('newsletter_subscribers','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('newsletter_subscribers','edit'));
grant select on public.page_view_daily to authenticated;
create policy workspace_read on public.page_view_daily for select to authenticated using (workspace_private.can_access('page_view_daily','read'));
grant select on public.blog_reads to authenticated;
create policy workspace_read on public.blog_reads for select to authenticated using (workspace_private.can_access('blog_reads','read'));
grant select on public.broadcast_log to authenticated;
create policy workspace_read on public.broadcast_log for select to authenticated using (workspace_private.can_access('broadcast_log','read'));
grant select on public.admin_security_events to authenticated;
create policy workspace_read on public.admin_security_events for select to authenticated using (workspace_private.can_access('admin_security_events','read'));
grant select on public.site_settings to authenticated;
create policy workspace_read on public.site_settings for select to authenticated using (workspace_private.can_access('site_settings','read'));
grant update on public.site_settings to authenticated;
create policy workspace_update on public.site_settings for update to authenticated using (workspace_private.can_access('site_settings','edit')) with check (workspace_private.can_access('site_settings','edit'));
create policy workspace_staff_guard_update on public.site_settings as restrictive for update to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('site_settings','edit')) with check (not workspace_private.is_staff() or workspace_private.can_access('site_settings','edit'));
create policy workspace_staff_read_guard on public.orders as restrictive for select to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('orders','read'));
create policy workspace_staff_read_guard on public.custom_requests as restrictive for select to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('custom_requests','read'));
create policy workspace_staff_read_guard on public.newsletter_subscribers as restrictive for select to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('newsletter_subscribers','read'));
create policy workspace_staff_read_guard on public.admin_security_events as restrictive for select to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('admin_security_events','read'));
create policy workspace_staff_read_guard on public.broadcast_log as restrictive for select to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('broadcast_log','read'));
create policy workspace_staff_read_guard on public.page_view_daily as restrictive for select to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('page_view_daily','read'));
create policy workspace_staff_read_guard on public.blog_reads as restrictive for select to authenticated using (not workspace_private.is_staff() or workspace_private.can_access('blog_reads','read'));
create policy workspace_storage_select on storage.objects for select to authenticated using (bucket_id in ('product-images','product-files') and workspace_private.can_access('storage','read'));
create policy workspace_storage_insert on storage.objects for insert to authenticated with check (bucket_id in ('product-images','product-files') and workspace_private.can_access('storage','edit'));
create policy workspace_storage_update on storage.objects for update to authenticated using (bucket_id in ('product-images','product-files') and workspace_private.can_access('storage','edit')) with check (bucket_id in ('product-images','product-files') and workspace_private.can_access('storage','edit'));
create policy workspace_storage_delete on storage.objects for delete to authenticated using (bucket_id in ('product-images','product-files') and workspace_private.can_access('storage','manage'));
commit;
