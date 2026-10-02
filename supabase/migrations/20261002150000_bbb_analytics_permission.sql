begin;
alter table public.workspace_page_permissions drop constraint workspace_page_key_check;
alter table public.workspace_page_permissions add constraint workspace_page_key_check check (page in ('orders','products','custom_requests','blog_posts','news_entries','docs_pages','faq_items','legal_pages','team_members','blog_media','services','pricing_plans','categories','sales','sale_events','sale_entries','homepage_reviews','reviews','newsletter_subscribers','page_view_daily','blog_reads','broadcast_log','admin_security_events','site_settings','user_roles','overview','storage','ziina','drm_products','drm_customers','drm_licenses','drm_validations','drm_requests','drm_audit','drm_sync','emails','bbb_analytics'));
commit;
