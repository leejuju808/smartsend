-- Block 177: Add intent_score to Companies table

alter table public.companies
  add column if not exists intent_score int default 0;

create index if not exists idx_companies_intent_score on public.companies(intent_score desc);

-- Comment
comment on column public.companies.intent_score is 'Aggregated buying intent score (sum of all intent signal weights)';












