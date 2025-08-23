import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY!);

const SINCE_DAYS = 7;

async function countEvents(name: string, sinceISO: string) {
  const { count } = await sb
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("event", name)
    .gte("created_at", sinceISO);
  return count ?? 0;
}

async function sumImportedContacts(sinceISO: string) {
  const { data } = await sb
    .from("events")
    .select("meta, created_at")
    .eq("event", "contacts_imported")
    .gte("created_at", sinceISO)
    .limit(2000);
  return (data || []).reduce((sum: number, r: any) => sum + (parseInt(r?.meta?.count ?? "0", 10) || 0), 0);
}

async function countActiveProNow() {
  const { count } = await sb
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("subscription_status", "pro");
  return count ?? 0;
}

function fmt(n: number) { return n.toLocaleString(); }

async function main() {
  const now = new Date();
  const since = new Date(now.getTime() - SINCE_DAYS * 24 * 3600 * 1000);
  const sinceISO = since.toISOString();

  const [signups, trials, checkoutInit, newPro, canceled, importedContacts, activePro] = await Promise.all([
    countEvents("signup", sinceISO),
    countEvents("trial_started", sinceISO),                    // optional: emit this when you create trial
    countEvents("checkout_initiated", sinceISO),
    countEvents("subscribed_pro", sinceISO),
    countEvents("subscription_canceled", sinceISO),
    sumImportedContacts(sinceISO),
    countActiveProNow(),
  ]);

  const conv = (newPro && signups) ? ((newPro / signups) * 100).toFixed(1) : "–";

  const text = `
SmartSendAI — Weekly Summary (${since.toISOString().slice(0,10)} → ${now.toISOString().slice(0,10)})

Topline
• Signups: ${fmt(signups)}
• Checkout initiated: ${fmt(checkoutInit)}
• New Pro: ${fmt(newPro)}
• Canceled: ${fmt(canceled)}
• Active Pro (now): ${fmt(activePro)}
• Est. signup→Pro conversion: ${conv}%

Usage (leading indicators)
• Contacts imported: ${fmt(importedContacts)}

Quick links
• Dashboard: ${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/analytics
• Billing:   ${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing
`.trim();

  const to = (process.env.ADMIN_REPORT_EMAILS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!to.length) throw new Error("Set ADMIN_REPORT_EMAILS");

  await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: "SmartSendAI – Weekly Revenue & Usage Summary",
    text,
  });
}

main().catch(e => { console.error(e); process.exit(1); }); 