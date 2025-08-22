-- Add enum type for user roles and alter workspace_members.role to use it
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('owner', 'admin', 'member');
  end if;
end $$;

alter table if exists public.workspace_members
  alter column role type user_role using (role::user_role),
  alter column role set not null,
  alter column role set default 'member';

