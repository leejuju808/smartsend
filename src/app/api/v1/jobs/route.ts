import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiAuth";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function randHex(len=24){const b=crypto.getRandomValues(new Uint8Array(len));return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req.headers.get("authorization") || undefined);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const { to, subject, html, scheduledAt, campaignId, fromEmail } = await req.json();
  if (!to || !subject || !html) return NextResponse.json({ error: "Missing to/subject/html" }, { status: 400 });

  const { error } = await sb.from("email_jobs").insert({
    user_id: auth.userId,
    campaign_id: campaignId ?? null,
    to_email: to,
    subject,
    body_html: html,
    scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
    tracking_token: randHex(16),
    from_email: fromEmail || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}