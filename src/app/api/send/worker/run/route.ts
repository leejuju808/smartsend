/* Simple rate-limited worker:
   - picks due queued messages grouped by smtp_account
   - respects per-account rate_limit_per_minute
   - sends via nodemailer
   - auto-suppresses on hard bounce-like SMTP codes
*/
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSMTPAccount } from "@/lib/mail/accounts";
import { sendEmail } from "@/lib/mail/send";

function isHardBounce(errorMsg: string): boolean {
  return /5\d\d|550|554|user unknown|mailbox unavailable|relay access denied|domain not found/i.test(errorMsg || "");
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json();
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

    const supabase = createClient();

    // Find distinct smtp accounts with due queued messages
    const { data: due, error: dErr } = await supabase
      .from("messages")
      .select("smtp_account_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "queued")
      .lte("scheduled_at", new Date().toISOString())
      .not("smtp_account_id", "is", null)
      .limit(1000);

    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
    const accounts = Array.from(new Set((due || []).map((d: any) => d.smtp_account_id))).filter(Boolean) as string[];

    let totalSent = 0, totalFailed = 0;

    for (const accId of accounts) {
      const account = await loadSMTPAccount(workspaceId, accId);
      if (!account) continue;

      const batchSize = Math.max(1, account.rate_limit_per_minute); // per minute; worker assumed to run per minute via cron
      const { data: msgs, error: mErr } = await supabase
        .from("messages")
        .select("id,to_email,subject,body_text")
        .eq("workspace_id", workspaceId)
        .eq("status", "queued")
        .eq("smtp_account_id", accId)
        .lte("scheduled_at", new Date().toISOString())
        .order("created_at", { ascending: true })
        .limit(batchSize);

      if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

      for (const m of msgs || []) {
        // mark sending (best-effort)
        await supabase.from("messages").update({ status: "sending", attempts: 1 }).eq("id", m.id);

        try {
          const result = await sendEmail({
            account,
            to: m.to_email,
            subject: m.subject,
            text: m.body_text
          });

          const ok = (result.accepted || []).length > 0;
          if (ok) {
            await supabase.from("messages").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", m.id);
            totalSent++;
          } else {
            const err = "SMTP rejected";
            await supabase.from("messages").update({ status: "failed", last_error: err }).eq("id", m.id);
            // suppress on hard bounce patterns
            await supabase.from("suppressions").insert({ workspace_id: workspaceId, email: m.to_email, reason: "bounced", metadata: { source: "smtp_reject" } }).select().single().catch(() => ({}));
            totalFailed++;
          }
        } catch (e: any) {
          const emsg = e?.message || String(e);
          await supabase.from("messages").update({ status: "failed", last_error: emsg }).eq("id", m.id);
          if (isHardBounce(emsg)) {
            await supabase.from("suppressions").insert({ workspace_id: workspaceId, email: m.to_email, reason: "bounced", metadata: { source: "smtp_error" } }).select().single().catch(() => ({}));
          }
          totalFailed++;
        }
      }

      // update sender_stats (lightweight)
      await supabase.from("sender_stats").upsert({
        smtp_account_id: accId,
        workspace_id: workspaceId,
        last_rolling_24h_sent: (totalSent), // simplistic; real impl should query past 24h
        last_rolling_7d_sent: (totalSent),
        last_bounce_count: totalFailed,
        health_score: Math.max(0, 100 - totalFailed * 5),
        updated_at: new Date().toISOString()
      });
    }

    return NextResponse.json({ ok: true, totalSent, totalFailed, accountsProcessed: accounts.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Worker failed" }, { status: 500 });
  }
}