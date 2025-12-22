-- Add lead_score to contacts
alter table public.contacts
  add column if not exists lead_score int default 0;

-- Create index for fast lead score queries
create index if not exists idx_contacts_lead_score on public.contacts(lead_score desc);

-- Function to increment score based on event type
create or replace function public.increment_score(p_email text, p_type text)
returns void as $$
declare pts int := 0;
begin
  if p_type='open' then pts := 1;
  elsif p_type='click' then pts := 3;
  elsif p_type='reply' then pts := 10;
  end if;

  update contacts
  set lead_score = coalesce(lead_score,0) + pts
  where lower(email) = lower(p_email);
end;
$$ language plpgsql;

-- Function to recompute all lead scores from events
create or replace function public.recompute_lead_scores()
returns void as $$
begin
  update contacts c set lead_score = sub.score
  from (
    select e.recipient_email as email,
      (count(*) filter (where e.type='open'))*1 +
      (count(*) filter (where e.type='click'))*3 +
      (count(*) filter (where e.type='reply'))*10 as score
    from email_events e
    group by e.recipient_email
  ) sub
  where lower(c.email) = lower(sub.email);
end;
$$ language plpgsql;

-- Function to add bonus points for tags (like "hot_lead")
create or replace function public.add_tag_bonus(p_email text, p_tag text)
returns void as $$
declare bonus int := 0;
begin
  if p_tag='hot_lead' then bonus := 15;
  elsif p_tag='vip' then bonus := 25;
  elsif p_tag='decision_maker' then bonus := 20;
  end if;

  if bonus > 0 then
    update contacts
    set lead_score = coalesce(lead_score,0) + bonus
    where lower(email) = lower(p_email);
  end if;
end;
$$ language plpgsql; 