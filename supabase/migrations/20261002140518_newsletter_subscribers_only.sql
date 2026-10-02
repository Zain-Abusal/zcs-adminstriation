alter table public.workspace_email_settings alter column audience set default 'dashboard';
update public.workspace_email_settings set audience = 'dashboard', updated_at = now() where audience <> 'dashboard';
alter table public.workspace_email_settings add constraint workspace_email_settings_subscriber_source check (audience = 'dashboard');
alter table public.workspace_email_jobs alter column audience set default 'dashboard';
update public.workspace_email_jobs set audience = 'dashboard' where status in ('queued', 'failed') and audience <> 'dashboard';
