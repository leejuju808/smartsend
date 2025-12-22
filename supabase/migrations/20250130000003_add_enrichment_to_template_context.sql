-- Add enrichment data to template_context_for_lead RPC function
-- This enables {{title}}, {{seniority}}, {{linkedin}}, {{company}}, {{industry}}, etc. in templates

create or replace function public.template_context_for_lead(p_campaign uuid, p_lead uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := '{}'::jsonb;
  v_token uuid;
  v_lead  record;
  v_camp  record;
  v_enrich record;
  v_host text := coalesce(current_setting('request.headers.x-forwarded-host', true), 'app.smartsendhq.com');
  k text;
  vj jsonb;
begin
  select * into v_lead from public.leads where id = p_lead;
  select * into v_camp from public.campaigns where id = p_campaign;
  
  -- Fetch enrichment data if available
  select * into v_enrich from public.lead_enrichment where lead_id = p_lead;

  v_token := public.ensure_optin_token(p_campaign, p_lead);

  v := public.jsonb_deep_merge(
        coalesce(v_camp.default_vars, '{}'::jsonb),
        jsonb_build_object(
          'LEAD_EMAIL', v_lead.email,
          'FIRST_NAME', coalesce(v_enrich.first_name, v_lead.first_name),
          'LAST_NAME',  coalesce(v_enrich.last_name, v_lead.last_name),
          'FULL_NAME',  coalesce(
            v_enrich.full_name,
            trim(coalesce(v_enrich.first_name, v_lead.first_name,'')||' '||coalesce(v_enrich.last_name, v_lead.last_name,''))
          ),
          'COMPANY',    coalesce(v_enrich.company, v_lead.company),
          'TITLE',      coalesce(v_enrich.title, v_lead.title),
          'CITY',       coalesce(v_enrich.city, v_lead.city),
          'STATE',      coalesce(v_enrich.state, v_lead.state),
          'COUNTRY',    coalesce(v_enrich.country, v_lead.country),
          -- Enrichment-specific fields
          'SENIORITY',  v_enrich.seniority,
          'LINKEDIN',   v_enrich.linkedin,
          'TIMEZONE',   v_enrich.timezone,
          'DOMAIN',     v_enrich.domain,
          'WEBSITE',    v_enrich.website,
          'INDUSTRY',   v_enrich.industry,
          'EMPLOYEE_COUNT', v_enrich.employee_count,
          'EMPLOYEE_RANGE', v_enrich.employee_range,
          'REVENUE',    v_enrich.revenue,
          'FOUNDED_YEAR', v_enrich.founded_year,
          'TECH_STACK', case when v_enrich.tech_stack is not null then array_to_string(v_enrich.tech_stack, ', ') else null end
        )
      );

  -- include meta.* flattened one level (stringify scalars)
  if v_lead.meta is not null then
    for k, vj in select key, value from jsonb_each(coalesce(v_lead.meta,'{}'::jsonb))
    loop
      if jsonb_typeof(vj) in ('string','number','boolean') then
        v := public.jsonb_deep_merge(v, jsonb_build_object(upper(k), vj));
      end if;
    end loop;
  end if;

  -- unsubscribe link
  v := public.jsonb_deep_merge(v, jsonb_build_object(
    'UNSUB_LINK', ('https://'||v_host||'/functions/v1/unsubscribe?t='||v_token::text)
  ));

  return v;
end;
$$;



