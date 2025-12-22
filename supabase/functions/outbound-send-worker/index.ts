// supabase/functions/outbound-send-worker/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type OutboundRow = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  campaign_contact_id: string;
  contact_id: string;
  step_id: string;
  to_email: string;
  subject: string;
  body: string;
  send_at: string;
};

type LeadContext = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
};

type ProfileSettings = {
  company_name?: string | null;
  default_city?: string | null;
  booking_url?: string | null;
  phone?: string | null;
  email_signature?: string | null;
};

function resolveName(lead: LeadContext): string {
  if (lead.name && lead.name.trim().length > 0) return lead.name;
  const parts = [lead.first_name, lead.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return "there";
}

function resolveCity(lead: LeadContext, profile: ProfileSettings): string {
  return (
    (lead.city && lead.city.trim().length > 0
      ? lead.city
      : profile.default_city) || ""
  );
}

function renderEmailBody(
  templateBody: string,
  lead: LeadContext,
  profile: ProfileSettings
): string {
  const name = resolveName(lead);
  const city = resolveCity(lead, profile);
  const company = profile.company_name || "our roofing team";

  let rendered = templateBody
    .replace(/{{\s*name\s*}}/gi, name)
    .replace(/{{\s*city\s*}}/gi, city)
    .replace(/{{\s*company\s*}}/gi, company);

  // Basic spacing normalization
  rendered = rendered.trim() + "\n\n";

  // Build CTA footer
  const parts: string[] = [];

  if (profile.company_name) {
    parts.push(`— ${profile.company_name}`);
  }

  if (profile.phone) {
    parts.push(`Call or text: ${profile.phone}`);
  }

  if (profile.booking_url) {
    parts.push(`Book a free roof inspection: ${profile.booking_url}`);
  }

  if (profile.email_signature) {
    parts.push(profile.email_signature);
  }

  const footer = parts.join("\n");

  if (footer.trim().length > 0) {
    rendered += footer + "\n";
  }

  return rendered;
}

async function sendEmailViaResend(
  msg: OutboundRow,
  finalBody: string
) {
  if (!RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const fromEmail =
    Deno.env.get("EMAIL_FROM") || "SmartSend <no-reply@smartsend.test>";

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [msg.to_email],
      subject: msg.subject,
      text: finalBody,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend error: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  return data.id as string | undefined;
}

Deno.serve(async (_req) => {
  try {
    // 1) Fetch due pending emails
    const { data, error } = await supabase
      .from("outbound_emails")
      .select(
        `
        id,
        workspace_id,
        campaign_id,
        campaign_contact_id,
        contact_id,
        step_id,
        to_email,
        subject,
        body,
        send_at,
        status
      `
      )
      .eq("status", "pending")
      .lte("send_at", new Date().toISOString())
      .order("send_at", { ascending: true })
      .limit(25);

    if (error) {
      console.error("Error fetching outbound_emails:", error);
      return new Response(
        JSON.stringify({ error: "fetch_error", details: error.message }),
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        status: 200,
      });
    }

    let processed = 0;

    for (const row of data as OutboundRow[]) {
      try {
        // Mark as sending (only if still pending)
        const { error: updateError } = await supabase
          .from("outbound_emails")
          .update({ status: "sending" })
          .eq("id", row.id)
          .eq("status", "pending");

        if (updateError) {
          console.error("Failed to mark sending:", updateError);
          continue;
        }

        // Fetch contact data for personalization
        const { data: contact } = await supabase
          .from("contacts")
          .select("first_name, last_name, city")
          .eq("id", row.contact_id)
          .maybeSingle();

        // Get workspace owner/admin profile for CTA footer settings
        const { data: workspaceMember } = await supabase
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", row.workspace_id)
          .in("role", ["owner", "admin"])
          .limit(1)
          .maybeSingle();

        let profile: ProfileSettings = {};
        if (workspaceMember?.user_id) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select(
              "company_name, default_city, booking_url, phone, email_signature"
            )
            .eq("id", workspaceMember.user_id)
            .maybeSingle();
          profile = profileData || {};
        }

        // Compose final email body with CTA footer
        const lead: LeadContext = {
          first_name: contact?.first_name || null,
          last_name: contact?.last_name || null,
          city: contact?.city || null,
        };

        const finalBody = renderEmailBody(row.body, lead, profile);

        // 2) Actually send
        const providerId = await sendEmailViaResend(row, finalBody);

        // 3) Mark as sent
        const sentAtIso = new Date().toISOString();
        const { error: sentError } = await supabase
          .from("outbound_emails")
          .update({
            status: "sent",
            sent_at: sentAtIso,
            provider_message_id: providerId ?? null,
            error_message: null,
          })
          .eq("id", row.id);

        if (sentError) {
          console.error("Failed to mark sent:", sentError);
          continue;
        }

        // 4) Ask Postgres to queue next step (if any) + update campaign_contact
        const { error: followError } = await supabase.rpc(
          "schedule_next_step_for_campaign_contact",
          { p_outbound_email_id: row.id },
        );

        if (followError) {
          console.error(
            "schedule_next_step_for_campaign_contact error:",
            followError,
          );
          // don't fail the whole loop, just log
        }

        processed += 1;
      } catch (err: any) {
        console.error("Error sending outbound email:", err);
        await supabase
          .from("outbound_emails")
          .update({
            status: "failed",
            error_message: err?.message || String(err),
          })
          .eq("id", row.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      status: 200,
    });
  } catch (err: any) {
    console.error("Worker fatal error:", err);
    return new Response(
      JSON.stringify({
        error: "worker_fatal",
        details: err?.message || String(err),
      }),
      { status: 500 },
    );
  }
});
