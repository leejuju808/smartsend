// Use the same Gmail push channel you set up for replies; route "mailer-daemon" / MDS here.
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
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

    const supabase = await getServerSupabase();
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
      await supabase
        .from("leads")
        .update({
          status: "bounced",
          outreach_status: "dead",
          reason_dead: "bounce_or_invalid",
        })
        .eq("email", recipient)
        .eq("workspace_id", workspace_id);
    }

    // BLOCK 181: Increment bounce counter for deliverability tracking
    if (campaign_id && recipient) {
      try {
        // Get campaign to find account_id and from_email
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("account_id, workspace_id, org_id, from_email")
          .eq("id", campaign_id)
          .maybeSingle();

        const account_id = campaign?.account_id || campaign?.workspace_id || campaign?.org_id;

        if (account_id && campaign?.from_email) {
          const senderDomain = campaign.from_email.split('@')[1]?.toLowerCase();
          if (senderDomain) {
            const { error: incErr } = await supabase.rpc('increment_bounce', {
              acc: account_id,
              dom: senderDomain
            });
            if (incErr) {
              console.error('Error incrementing bounce counter:', incErr);
            }
          }
        }
        
        // Log to unified activity_log
        if (account_id) {
          try {
            // Find lead by email
            const { data: lead } = await supabase
              .from('leads')
              .select('id, company_id')
              .eq('email', recipient)
              .maybeSingle();
            
            await supabase.from('activity_log').insert({
              account_id,
              campaign_id,
              company_id: lead?.company_id || null,
              lead_id: lead?.id || null,
              event_type: 'email_bounce',
              meta: { 
                kind: parsed.kind,
                smtp_status: parsed.smtpStatus,
                error: parsed.diagnostic?.slice(0, 500) || null
              },
            });
          } catch (activityErr) {
            console.error('Failed to log bounce activity:', activityErr);
          }
        }
      } catch (err) {
        console.error('Error tracking bounce for deliverability:', err);
      }
    }

    return NextResponse.json({ success: true, kind: parsed.kind });
  } catch (e) {
    console.error("bounce webhook error", e);
    return NextResponse.json({ error: "bounce webhook failed" }, { status: 500 });
  }
} 