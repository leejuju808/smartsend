-- Keep threads.updated_at fresh & manage unread_count

create or replace function public.bump_thread_and_unread()

returns trigger language plpgsql as $$

begin

  update public.threads

     set updated_at = now(),

         unread_count = case

           when NEW.direction = 'inbound' then unread_count + 1

           else unread_count

         end

   where id = NEW.thread_id;

  return NEW;

end $$;



drop trigger if exists trg_emails_bump on public.emails;

create trigger trg_emails_bump

after insert on public.emails

for each row execute function public.bump_thread_and_unread();



-- Queue outbound emails into outbox

create or replace function public.enqueue_outbound()

returns trigger language plpgsql as $$

begin

  if NEW.direction = 'outbound' then

    insert into public.email_outbox (project_id, email_id) values (NEW.project_id, NEW.id);

  end if;

  return NEW;

end $$;



drop trigger if exists trg_emails_enqueue on public.emails;

create trigger trg_emails_enqueue

after insert on public.emails

for each row execute function public.enqueue_outbound();



-- Mark thread read (helper RPC uses this: sets unread_count=0)

create or replace function public.mark_thread_read(p_thread uuid, p_project uuid)

returns void language sql security definer set search_path=public as $$

  update public.threads

     set unread_count = 0

   where id = p_thread and project_id = p_project and is_member(project_id);

$$;

