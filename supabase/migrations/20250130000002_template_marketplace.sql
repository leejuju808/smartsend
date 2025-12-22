-- Template Marketplace Shell (Block 402)
-- Adds visibility and created_by fields to sequence_templates for marketplace functionality

-- Add visibility column (public or private)
alter table public.sequence_templates
add column if not exists visibility text check (visibility in ('public', 'private')) default 'private';

-- Add created_by column (references profiles)
alter table public.sequence_templates
add column if not exists created_by uuid references public.profiles(id);

-- Create index for marketplace queries
create index if not exists idx_sequence_templates_visibility on public.sequence_templates(visibility);
create index if not exists idx_sequence_templates_created_by on public.sequence_templates(created_by);

-- Update RLS policies
-- Drop existing policies
drop policy if exists "sequence_templates_select_all" on public.sequence_templates;
drop policy if exists "sequence_templates_insert_admin" on public.sequence_templates;

-- New policy: public templates are readable by everyone, private templates only by creator
create policy "sequence_templates_select_public_or_owner"
on public.sequence_templates
for select
using (visibility = 'public' or created_by = auth.uid());

-- Allow authenticated users to insert their own templates
create policy "sequence_templates_insert_own"
on public.sequence_templates
for insert
to authenticated
with check (created_by = auth.uid());

-- Allow users to update their own templates
create policy "sequence_templates_update_own"
on public.sequence_templates
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

-- Allow users to delete their own templates
create policy "sequence_templates_delete_own"
on public.sequence_templates
for delete
to authenticated
using (created_by = auth.uid());

-- Update sequence_template_steps policies to allow inserts/updates/deletes for template owners
drop policy if exists "sequence_template_steps_insert_admin" on public.sequence_template_steps;

-- Allow users to insert steps for templates they own
create policy "sequence_template_steps_insert_own"
on public.sequence_template_steps
for insert
to authenticated
with check (
  exists (
    select 1 from public.sequence_templates
    where id = template_id
    and created_by = auth.uid()
  )
);

-- Allow users to update steps for templates they own
create policy "sequence_template_steps_update_own"
on public.sequence_template_steps
for update
to authenticated
using (
  exists (
    select 1 from public.sequence_templates
    where id = template_id
    and created_by = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sequence_templates
    where id = template_id
    and created_by = auth.uid()
  )
);

-- Allow users to delete steps for templates they own
create policy "sequence_template_steps_delete_own"
on public.sequence_template_steps
for delete
to authenticated
using (
  exists (
    select 1 from public.sequence_templates
    where id = template_id
    and created_by = auth.uid()
  )
);



