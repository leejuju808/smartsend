-- Add foreign keys for audit_campaign_members table
-- This enables cleaner joins in queries and ensures referential integrity

-- Add foreign key for actor (references profiles)
do $$ 
begin
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'audit_actor_fk' 
    and table_schema = 'public'
    and table_name = 'audit_campaign_members'
  ) then
    alter table public.audit_campaign_members
      add constraint audit_actor_fk 
      foreign key (actor) 
      references public.profiles(id) 
      on delete set null;
  end if;
end $$;

-- Add foreign key for target_user (references profiles)
do $$ 
begin
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'audit_target_fk' 
    and table_schema = 'public'
    and table_name = 'audit_campaign_members'
  ) then
    alter table public.audit_campaign_members
      add constraint audit_target_fk 
      foreign key (target_user) 
      references public.profiles(id) 
      on delete set null;
  end if;
end $$;

