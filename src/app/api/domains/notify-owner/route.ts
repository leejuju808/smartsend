import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function POST() {
  // find domains over threshold without verified claim; pick a pro user to notify
  const { data: rows } = await supabaseAdmin.rpc("domains_to_notify"); // see SQL below
  for (const r of rows || []) {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/emails/send`, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          to: r.owner_email,
          subject: `Claim ${r.domain} on SmartSendAI`,
          text: `We see ${r.users_30d} signups from ${r.domain}. Claim your domain to auto-join teammates:\n${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings`
        })
      });
      await supabaseAdmin.from("events").insert({ user_id: r.owner_id, event: "domain_nudge_sent", meta: { domain: r.domain } });
    } catch {}
  }
  return NextResponse.json({ ok:true, count: (rows||[]).length });
} 