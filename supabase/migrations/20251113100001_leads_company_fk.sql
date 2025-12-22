-- Block 175: Add company_id foreign key to leads table

alter table public.leads
  add column if not exists company_id uuid references public.companies(id) on delete set null;

-- Index for leads by company
create index if not exists idx_leads_company_id on public.leads(company_id) where company_id is not null;

-- Comment
comment on column public.leads.company_id is 'Reference to company record for this lead';

