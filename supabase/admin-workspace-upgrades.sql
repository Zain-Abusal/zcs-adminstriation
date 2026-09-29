-- ZCraft admin workspace upgrades for orders, Ziina tracking, and API audit logging.
-- Run this in the existing Supabase project before using the new admin screens.

alter table public.orders
  add column if not exists title text,
  add column if not exists customer_name text,
  add column if not exists custom_request_id uuid references public.custom_requests(id) on delete set null,
  add column if not exists priority text not null default 'normal',
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists fulfillment_status text not null default 'new',
  add column if not exists internal_notes text,
  add column if not exists due_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists ziina_payment_link_id text,
  add column if not exists ziina_payment_url text;

update public.orders
set
  title = coalesce(title, nullif(provider_order_id, ''), 'Manual order'),
  payment_status = case when status in ('paid', 'completed') then 'paid' else payment_status end,
  fulfillment_status = case
    when status in ('completed', 'closed') then status
    when status in ('in_progress', 'new') then status
    else fulfillment_status
  end
where title is null;

alter table public.orders
  alter column title set default 'Manual order',
  alter column title set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_priority_check'
  ) then
    alter table public.orders
      add constraint orders_priority_check
      check (priority in ('low', 'normal', 'high', 'urgent')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'orders_payment_status_check'
  ) then
    alter table public.orders
      add constraint orders_payment_status_check
      check (payment_status in ('unpaid', 'pending', 'paid', 'refunded')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'orders_fulfillment_status_check'
  ) then
    alter table public.orders
      add constraint orders_fulfillment_status_check
      check (fulfillment_status in ('new', 'in_progress', 'completed', 'closed')) not valid;
  end if;
end $$;

create index if not exists orders_custom_request_id_idx on public.orders(custom_request_id);
create index if not exists orders_priority_idx on public.orders(priority);
create index if not exists orders_payment_status_idx on public.orders(payment_status);
create index if not exists orders_fulfillment_status_idx on public.orders(fulfillment_status);
create index if not exists orders_archived_at_idx on public.orders(archived_at);

create table if not exists public.admin_security_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  ip_address inet,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_security_events enable row level security;

drop policy if exists "Admins can read security events" on public.admin_security_events;
create policy "Admins can read security events"
on public.admin_security_events
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can write security events" on public.admin_security_events;
create policy "Admins can write security events"
on public.admin_security_events
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create index if not exists admin_security_events_created_at_idx
  on public.admin_security_events(created_at desc);
create index if not exists admin_security_events_actor_idx
  on public.admin_security_events(actor_user_id);
