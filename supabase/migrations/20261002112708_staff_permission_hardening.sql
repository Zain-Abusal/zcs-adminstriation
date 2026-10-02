-- Privileged retention runs must not bypass read-only staff permissions.
do $$ begin
 if to_regprocedure('public.prune_analytics()') is not null then
  revoke execute on function public.prune_analytics() from public, anon, authenticated;
  grant execute on function public.prune_analytics() to service_role;
 end if;
end $$;
-- Authorized Ziina staff append their own server audit entries.
grant insert on public.admin_security_events to authenticated;
create policy workspace_ziina_audit_insert on public.admin_security_events
for insert to authenticated with check (
 actor_user_id = auth.uid() and public.workspace_can_access('ziina','edit')
);
