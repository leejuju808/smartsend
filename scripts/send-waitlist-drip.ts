import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const resend = new Resend(process.env.RESEND_API_KEY!);
const SITE = process.env.NEXT_PUBLIC_SITE_URL!;
const FROM = process.env.RESEND_FROM!;

type Row = { email: string; created_at: string };

async function alreadySent(email: string, type: string) {
  const { data } = await supabase
    .from("waitlist_emails").select("id").eq("email", email).eq("type", type).maybeSingle();
  return !!data;
}

async function isSuppressed(email: string) {
  const { data } = await supabase
    .from("suppression_list").select("email").eq("email", email).maybeSingle();
  return !!data;
}

async function sendEmail(to: string, subject: string, text: string, type: string) {
  if (await alreadySent(to, type)) return;
  if (await isSuppressed(to)) return;
  await resend.emails.send({ from: FROM, to, subject, text });
  await supabase.from("waitlist_emails").insert({ email: to, type });
}

function daysSince(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000*60*60*24));
}

async function main() {
  const { data: leads, error } = await supabase
    .from("waitlist").select("email,created_at").order("created_at", { ascending: false });
  if (error) throw error;

  for (const row of (leads || []) as Row[]) {
    const email = row.email.toLowerCase();
    const d = daysSince(row.created_at);

    // Day 0: Welcome
    if (d >= 0 && d < 1) {
      await sendEmail(
        email,
        "Welcome to SmartSendAI — book more meetings",
        `
You're on the list! SmartSendAI helps you turn cold replies into booked meetings:

• Auto-insert Calendly + .ics when prospects say "let's talk"
• Import leads fast (CSV), auto-dedupe & suppress unsubscribes
• Paywall keeps the best features Pro-only

Start your 7-day free trial (no friction):
${SITE}/upgrade

Want out? Unsubscribe: ${SITE}/unsubscribe
`.trim(),
        "welcome"
      );
      continue;
    }

    // Day 2: Case study (social proof)
    if (d >= 2 && d < 3) {
      await sendEmail(
        email,
        "How reps convert replies into meetings (real workflow)",
        `
A simple workflow our users use to book more calls:

1) Import 1–5k leads (CSV)
2) First reply comes in? We detect "call/meet" intent
3) We auto-append your Calendly link + attach a 30-min .ics invite
4) Meetings land on your calendar — you close

Try it on your own inbox:
${SITE}/upgrade

Unsubscribe: ${SITE}/unsubscribe
`.trim(),
        "case_study"
      );
      continue;
    }

    // Day 5: Trial invite (strong CTA)
    if (d >= 5 && d < 6) {
      await sendEmail(
        email,
        "Your 7-day trial is waiting — start today",
        `
You've seen what SmartSendAI does — now feel it:

• 7-day free trial
• Unlimited AI replies
• Calendly auto-insert + .ics
• CSV import + suppression

Start now (one click):
${SITE}/upgrade

Unsubscribe: ${SITE}/unsubscribe
`.trim(),
        "trial_invite"
      );
      continue;
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); }); 