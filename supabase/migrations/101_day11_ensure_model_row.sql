create or replace function public.ensure_model_row(_mv text)
returns void
language plpgsql
as $$
begin
  insert into public.ai_model_registry (model_version, status)
  values (_mv, 'pending')
  on conflict (model_version) do nothing;
end;
$$;
















