-- 002_reply_trigger.sql
-- HTTP trigger via postgres function + http extension (pg_net) approach

-- Enable pg_net (if using Supabase managed PG: already available as "pg_net")
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'notify_reply_detection') then
    create or replace function public.notify_reply_detection()
    returns trigger
    language plpgsql
    as $fn$
    declare
      resp json;
    begin
      -- Only inbound
      if NEW.direction = 'inbound' then
        perform net.http_post(
          url := current_setting('app.settings.reply_detection_url', true),
          headers := jsonb_build_object('Content-Type','application/json'),
          body := jsonb_build_object('type','INSERT','table','emails','record',to_jsonb(NEW))
        );
      end if;
      return NEW;
    end
    $fn$;
  end if;
end $$;

drop trigger if exists trg_emails_reply_detection on public.emails;

create trigger trg_emails_reply_detection
after insert on public.emails
for each row execute function public.notify_reply_detection();

