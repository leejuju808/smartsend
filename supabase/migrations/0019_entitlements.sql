-- Feature gates (Pro-only)

create or replace function public.has_active_subscription(p_project uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.subscriptions s
    where s.project_id = p_project
      and s.status in ('trialing','active','past_due')  -- allow grace if you want
  );
$$;

