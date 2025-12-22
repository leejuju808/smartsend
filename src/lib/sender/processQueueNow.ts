// lib/sender/processQueueNow.ts
import { createClient } from "@supabase/supabase-js";
import { injectPixel, registerPixel } from "@/lib/tracking/pixel";

const DEFAULT_TRACKING_HOST =
  process.env.NEXT_PUBLIC_TRACKING_HOST ||
  process.env.TRACKING_HOST ||
  process.env.EMAIL_TRACKING_HOST ||
  "links.smartsend.ai";

const GDPR_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "UK", "GB",
]);

type Params = { queueId: string };

export async function processQueueNow({ queueId }: Params) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
  );

  // Lock the row - select both account_id and mailbox_id to handle schema variants
  const { data: qrow, error: qerr } = await supabase
    .from("send_queue")
    .update({ status: "sending" })
    .eq("id", queueId)
    .in("status", ["queued", "sending"])
    .select("id,campaign_id,lead_id,account_id,mailbox_id,step_no,subject_effective,body_html_effective,variant_id")
    .single();
  if (qerr || !qrow) throw new Error(qerr?.message || "Queue item not found");

  // Compose (step-aware)
  const { data: comp, error: cerr } = await supabase.rpc("compose_email_by_step", {
    p_campaign: qrow.campaign_id,
    p_lead: qrow.lead_id,
    p_step: (qrow as any).step_no ?? 1,
  });
  if (cerr) throw new Error(cerr.message);
  const { to_email, subject: composedSubject, html: composedHtml } = Array.isArray(comp) ? comp[0] : comp;

  // Prefer effective fields (from rewrites) if present, else fallback to composed
  const subject = (qrow as any).subject_effective ?? composedSubject ?? "";
  let bodyHtml: string = (qrow as any).body_html_effective ?? composedHtml ?? "";

  // Load account tracking preferences
  const accountId: string | undefined = (qrow as any).account_id ?? undefined;
  if (accountId) {
    const { data: account } = await supabase
      .from("accounts")
      .select("track_opens, tracking_host")
      .eq("id", accountId)
      .maybeSingle();

    const trackOpens = account?.track_opens ?? true;
    const trackingHost = account?.tracking_host || DEFAULT_TRACKING_HOST;

    if (trackOpens && trackingHost) {
      const { data: leadRow } = await supabase
        .from("leads")
        .select("country_code, country")
        .eq("id", qrow.lead_id)
        .maybeSingle();

      const rawCountry =
        leadRow?.country_code ||
        leadRow?.country ||
        null;
      const countryCode =
        typeof rawCountry === "string"
          ? rawCountry.trim().slice(0, 2).toUpperCase()
          : null;
      const gdprOptOut = countryCode ? GDPR_COUNTRIES.has(countryCode) : false;

      const pixel = await registerPixel({
        accountId,
        campaignId: qrow.campaign_id ?? undefined,
        leadId: qrow.lead_id ?? undefined,
        messageId: qrow.id,
        gdprOptOut,
      });

      bodyHtml = injectPixel(bodyHtml, trackingHost, pixel, gdprOptOut);
    }
  }

  const normalizedEmail = typeof to_email === "string" ? to_email.trim().toLowerCase() : null;
  if (normalizedEmail) {
    const { data: suppressed, error: supErr } = await supabase.rpc("is_suppressed", {
      p_email: normalizedEmail,
      p_account: (qrow as any).account_id ?? null,
      p_campaign: qrow.campaign_id ?? null,
    });
    if (supErr) {
      throw new Error(`Suppression check failed: ${supErr.message}`);
    }
    if (suppressed) {
      await supabase.from("send_queue")
        .update({ status: "canceled", last_error: "Suppressed recipient" })
        .eq("id", qrow.id);
      await supabase.from("outbox_events")
        .insert({
          message_id: qrow.id,
          event: "canceled",
          code: "suppressed",
          detail: normalizedEmail,
        })
        .catch(() => {
          /* optional table */
        });
      return { ok: false, suppressed: true };
    }
  }

  // TODO: swap with your actual mail sender.
  // Example: await mailerSend({ accountId: qrow.account_id, ...sendPayload });
  const sendPayload = { to: to_email, subject, html: bodyHtml };
  const sentOk = !!sendPayload;

  // Get account_id/mailbox_id from queue row (handle both schema variants)
  const accountOrMailboxId = (qrow as any).account_id || (qrow as any).mailbox_id;

  if (sentOk) {
    // Insert send_logs - using columns that exist in the schema
    await supabase.from("send_logs").insert({
      campaign_id: qrow.campaign_id,
      queue_id: qrow.id,
      mailbox_id: accountOrMailboxId || null,
      status: "sent",
      sent_at: new Date().toISOString(),
      variant_id: (qrow as any).variant_id || null,
    });
    await supabase.from("send_queue")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", qrow.id);

    // Block 14400: Set source_campaign_id on contact if it's currently null
    if (qrow.lead_id && qrow.campaign_id) {
      await supabase
        .from("contacts")
        .update({ source_campaign_id: qrow.campaign_id })
        .eq("id", qrow.lead_id)
        .is("source_campaign_id", null);
    }
  } else {
    await supabase.from("send_logs").insert({
      campaign_id: qrow.campaign_id,
      queue_id: qrow.id,
      mailbox_id: accountOrMailboxId || null,
      status: "failed",
      error: "Send failed",
      variant_id: (qrow as any).variant_id || null,
    });
    await supabase.from("send_queue")
      .update({ status: "failed", last_error: "Send failed" })
      .eq("id", qrow.id);
  }

  return { ok: true, to: to_email, subject };
}
