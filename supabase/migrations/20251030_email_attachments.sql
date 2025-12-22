-- Email Attachments Migration
-- This migration creates the email_attachments table and storage bucket for file uploads

-- 1. Create email_attachments table
create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  message_id uuid references public.email_messages(id) on delete set null,
  
  -- File metadata
  filename text not null,
  content_type text not null,
  file_size bigint not null,
  storage_path text not null, -- path in Supabase Storage
  
  -- Inline image support
  is_inline boolean not null default false,
  content_id text, -- CID for inline images (e.g., cid_logo_123)
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for efficient querying
create index if not exists idx_email_attachments_message_id 
  on public.email_attachments (message_id);
create index if not exists idx_email_attachments_workspace 
  on public.email_attachments (workspace_id, user_id);
create index if not exists idx_email_attachments_content_id 
  on public.email_attachments (content_id) where content_id is not null;

-- Update timestamp trigger
create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_email_attachments_updated_at on public.email_attachments;
create trigger trg_email_attachments_updated_at
  before update on public.email_attachments
  for each row
  execute function public.update_updated_at_column();

-- Enable RLS
alter table public.email_attachments enable row level security;

-- RLS policies
create policy "Users can view attachments in their workspace"
  on public.email_attachments for select
  using (workspace_id in (
    select workspace_id from public.workspace_members 
    where user_id = auth.uid()
  ));

create policy "Users can insert their own attachments"
  on public.email_attachments for insert
  with check (user_id = auth.uid() and workspace_id in (
    select workspace_id from public.workspace_members 
    where user_id = auth.uid()
  ));

create policy "Users can update their own attachments"
  on public.email_attachments for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own attachments"
  on public.email_attachments for delete
  using (user_id = auth.uid());

-- Service role can do everything
create policy "Service role full access"
  on public.email_attachments
  to service_role
  using (true)
  with check (true);

-- Add direction column to email_messages if it doesn't exist
alter table if exists public.email_messages 
  add column if not exists direction text check (direction in ('in', 'out'));

-- 2. Create storage bucket (this will be run via Supabase dashboard or CLI)
-- NOTE: The bucket is created via TypeScript code in the migration execution
-- You need to manually create the bucket in Supabase dashboard or use the SQL below

-- Create storage bucket: email-attachments
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'email-attachments',
  'email-attachments',
  false,
  10485760, -- 10 MB limit
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain'
  ]
)
on conflict (id) do nothing;

-- Storage policies for the bucket
create policy "Users can upload to their own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'email-attachments' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read their own files"
  on storage.objects for select
  using (
    bucket_id = 'email-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own files"
  on storage.objects for delete
  using (
    bucket_id = 'email-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role can do everything
create policy "Service role can manage all files"
  on storage.objects
  to service_role
  using (true)
  with check (true);


