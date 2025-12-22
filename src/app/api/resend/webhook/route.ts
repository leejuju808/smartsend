// app/api/resend/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// (Optionally verify signature: Resend provides a header + secret. Skipped here for brevity.)
export async function POST(req: NextRequest) {
  const evt = await req.json(); // shape varies; check Resend docs
  // Expect evt.type like 'email.bounced' or 'email.complained' and metadata with your tracking token or provider id.

  const type = evt?.type as string;
  const to = evt?.data?.to?.[0]; // adjust per payload
  const reason = type === "email.complained" ? "complaint" : type === "email.bounced" ? "bounced" : null;

  // Optional: map provider_id back to job via email_sends.provider_id.
  if (reason && to) {
    // We don't know user_id here; safest: look up latest job for this recipient
    const { data: lastJob } = await sb
      .from("email_jobs").select("id,user_id,to_email").eq("to_email", to)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (lastJob) {
      await sb.from("email_suppressions").upsert({
        user_id: lastJob.user_id,
        email: lastJob.to_email,
        reason
      });
      await sb.from("email_events").insert({
        job_id: lastJob.id,
        kind: reason === "bounced" ? "bounce" : "complaint",
        meta: evt
      });
    }
  }
  return NextResponse.json({ ok: true });
}