// SmartSend — Block 17: Win-Back Drip System
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const WINBACK_FROM = Deno.env.get("WINBACK_FROM") || "SmartSend <team@smartsendhq.com>";
const APP_URL = Deno.env.get("APP_URL") || "https://app.smartsendhq.com";

serve(async (req) => {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const today = new Date().toISOString().slice(0, 10);

    // Fetch due winback jobs
    const { data: due, error } = await sb
      .from("winback_queue")
      .select("*")
      .is("sent_at", null)
      .eq("scheduled_for", today);

    if (error) {
      console.error("Error fetching winback queue:", error);
      return new Response(JSON.stringify(error), { status: 500 });
    }

    let sent = 0;
    let failed = 0;

    for (const job of due ?? []) {
      try {
        // Fetch org owner
        const { data: org } = await sb
          .from("orgs")
          .select("owner_id, name")
          .eq("id", job.org_id)
          .maybeSingle();

        if (!org) {
          console.error(`Org not found for job ${job.id}`);
          failed++;
          continue;
        }

        // Get user email
        const { data: prof } = await sb.auth.admin.getUserById(org.owner_id);
        const to = prof?.user?.email;

        if (!to) {
          console.error(`Email not found for user ${org.owner_id}`);
          failed++;
          continue;
        }

        // Send winback email via Resend
        if (RESEND_API_KEY) {
          const { subject, html } = winbackTemplate(job.stage, org.name);

          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: WINBACK_FROM,
              to,
              subject,
              html,
            }),
          });

          if (!emailRes.ok) {
            console.error(`Failed to send email to ${to}:`, await emailRes.text());
            failed++;
            continue;
          }
        } else {
          console.warn("RESEND_API_KEY not configured, skipping email");
        }

        // Record churn guard event
        await sb.from("churn_guard_events").insert({
          org_id: job.org_id,
          event_type: "winback_sent",
          payload: { stage: job.stage },
        });

        // Mark as sent
        await sb
          .from("winback_queue")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", job.id);

        sent++;
      } catch (error) {
        console.error(`Error processing winback job ${job.id}:`, error);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent, failed, count: due?.length ?? 0 }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in winback-drip:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

function winbackSubject(stage: number): string {
  switch (stage) {
    case 1:
      return "Can we keep SmartSend working for you? (+free month)";
    case 2:
      return "Quick check‑in — want help getting replies today?";
    default:
      return "Last nudge — your campaigns are 1 click from reactivating";
  }
}

function winbackHtml(stage: number, orgName?: string): string {
  const cta = `${APP_URL}/upgrade`;
  const greeting = orgName ? `Hi there,` : "Hi,";

  return `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>${greeting}</h2>
      <p>We noticed your subscription isn't active. Want help getting back to live replies?</p>
      <div style="margin: 30px 0; text-align: center;">
        <a href="${cta}" style="background: #000; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600;">
          Reactivate Plan
        </a>
      </div>
      ${stage === 1 ? '<p style="background: #fef3c7; padding: 15px; border-radius: 6px;"><strong>Special Offer:</strong> Get your first month free when you reactivate.</p>' : ""}
      <p style="color: #666; font-size: 14px; margin-top: 30px;">If you need hands‑on help, just reply to this email.</p>
    </div>
  `;
}

function winbackTemplate(stage: number, orgName?: string): { subject: string; html: string } {
  return {
    subject: winbackSubject(stage),
    html: winbackHtml(stage, orgName),
  };
}

