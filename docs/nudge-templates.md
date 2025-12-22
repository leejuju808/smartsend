## Nudge Templates & Draft Nudges

### Overview
- `public.nudge_templates` stores per-campaign follow-up copy variations keyed by `tone` and conversation `scenario`.
- Template bodies support the tokens `{lead_first}`, `{company}`, `{me}`, `{duration}`, `{booking_link}`, `{last_msg}`, `{cta}` which are hydrated when rendering a nudge.
- `public.v_thread_last_inbound` exposes the most recent inbound message metadata needed to contextualize nudges.

### Seeding Quick-Start Templates
- Run the idempotent seed script at `supabase/sql/nudge_templates_seed.sql` to populate three starter templates (professional/no_reply, friendly/question, concise/positive) for every campaign that does not already define that tone+scenario pair.
- Customize the copy or add additional rows to fit your team’s voice before running in production.

### Smoke Tests
- Label a thread’s last inbound as `question`, trigger **Preview nudge**, and confirm the `scenario=question` template populates with token replacements.
- Switch tone to `friendly` and re-preview; verify the copy updates to the friendly template.
- Click **Insert as draft** and check `public.send_queue` for a row with `source='followup_nudge'`.
- Ensure campaigns with meeting preferences populate `{booking_link}` and `{duration}` tokens in the preview.
- Clear templates for a campaign and confirm the hard-coded fallback body and subject still render.

