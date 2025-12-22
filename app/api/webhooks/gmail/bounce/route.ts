// Use the same Gmail push channel you set up for replies; route "mailer-daemon" / MDS here.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { parseBounce } from "@/lib/email/parseBounce";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    // Expect fields you map from Gmail webhook:
    // from, to, subject, snippet, body, threadId, workspace_id, campaign_id, email_log_id
    const { from, body, workspace_id, campaign_id, email_log_id } = payload;

    // gate: only handle system bounces
    const isMailerDaemon = /mailer-daemon|mail delivery subsystem/i.test(from || "");
    if (!isMailerDaemon) return NextResponse.json({ ignored: true });

    const supabase = createClient();
    const parsed = parseBounce(body || "");

    // Resolve recipient: prefer parsed, else the original log row
    let recipient = parsed.recipient;
    if (!recipient && email_log_id) {
      const { data: log } = await supabase.from("email_logs").select("to").eq("id", email_log_id).maybeSingle();
      recipient = log?.to ?? undefined;
    }
    if (!recipient) recipient = ""; // still store row for diagnosis

    // Record bounce
    await supabase.from("email_bounces").insert({
      workspace_id, campaign_id, email_log_id,
      recipient,
      kind: parsed.kind,
      smtp_status: parsed.smtpStatus,
      diagnostic: parsed.diagnostic?.slice(0, 2000),
      provider: "gmail",
      raw: payload
    });

    // Mark email_log as failed (deliverability)
    if (email_log_id) {
      await supabase.from("email_logs").update({
        status: "failed",
        error: `bounce:${parsed.kind}:${parsed.smtpStatus || ""}`
      }).eq("id", email_log_id);
    }

    // Hard bounce → suppress
    if (parsed.kind === "hard" && recipient) {
      await supabase.from("suppression_list").upsert({
        workspace_id, email: recipient, reason: "hard_bounce"
      }, { onConflict: "email" });
      await supabase.from("leads").update({ status: "bounced" }).eq("email", recipient).eq("workspace_id", workspace_id);
    }

    return NextResponse.json({ success: true, kind: parsed.kind });
  } catch (e) {
    console.error("bounce webhook error", e);
    return NextResponse.json({ error: "bounce webhook failed" }, { status: 500 });
  }
}