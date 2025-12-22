import { Buffer } from "node:buffer";
import { supabaseAdmin } from "@/server/supabase";
import { renderTemplate } from "@/lib/templating";
import { getLeadContext } from "@/lib/renderContext";
import { ensureOutboundRecord, makeMessageId } from "@/server/tracking";
import { isSuppressed, addSuppression, classifySendError } from "@/server/suppression";

type Lead = { id: string; email: string; name?: string; company?: string };

async function hasReplied(ownerId: string, sequenceId: string, leadId: string) {
  const { data } = await supabaseAdmin
    .from("outbound_messages")
    .select("id")
    .eq("owner", ownerId)
    .eq("sequence_id", sequenceId)
    .eq("lead_id", leadId)
    .eq("replied", true)
    .limit(1);
  return !!(data && data.length);
}

export async function sendStepEmail(params: {
  ownerId: string;
  ownerEmail: string; // required for unsubscribe token
  lead: Lead;
  sequenceId: string;
  stepNo: number;
  subject: string;
  bodyHtml: string;
  transportSend: (m: { to: string; subject: string; html: string; headers: Record<string, string> }) => Promise<void>;
}) {
  const { ownerId, ownerEmail, lead, sequenceId, stepNo, subject } = params;
  let { bodyHtml } = params;

  // Suppression check before any work
  if (await isSuppressed(ownerId, lead.email)) {
    await supabaseAdmin
      .from("send_events")
      .insert({ owner: ownerId, lead_id: lead.id, sequence_id: sequenceId, kind: "suppressed" })
      .catch(() => {});
    return { skipped: true as const, reason: "suppressed" as const };
  }

  // Optional safety: require verified mailbox
  const { data: mb } = await supabaseAdmin
    .from("mailboxes")
    .select("verified")
    .eq("owner", ownerId)
    .maybeSingle();
  if (!mb?.verified) return { skipped: true as const, reason: "mailbox_not_verified" as const };

  // Defensive: ensure sequence is running before sending
  if (!(await isSequenceRunning(sequenceId, ownerId))) {
    return { skipped: true as const, reason: "sequence_paused" as const };
  }

  // Stop if lead unsubscribed or already replied
  const { data: leadRow } = await supabaseAdmin
    .from("leads")
    .select("unsubscribed")
    .eq("id", lead.id)
    .single();
  if (leadRow?.unsubscribed) return { skipped: true as const, reason: "unsubscribed" as const };
  if (await hasReplied(ownerId, sequenceId, lead.id)) return { skipped: true as const, reason: "replied" as const };

  // Ensure outbound record to get pixel token and tracking key
  const { outboundId, pixelToken, trackingKey } = await ensureOutboundRecord({ owner: ownerId, leadId: lead.id, sequenceId, stepNo });

  // Render subject/body with personalization context before injection
  const ctxBase = await (async function senderCtx(owner: string) {
    const { data: mb } = await supabaseAdmin
      .from("mailboxes")
      .select("from_email, from_name")
      .eq("owner", owner)
      .maybeSingle();
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("tz")
      .eq("id", owner)
      .maybeSingle();
    const now = new Date();
    const todayISO = now.toISOString();
    return {
      sender: { name: mb?.from_name || "", email: mb?.from_email || "" },
      todayISO,
    };
  })(ownerId);

  // Get full lead context for templating
  const leadContext = await getLeadContext(lead.id);

  const renderedSubject = renderTemplate(subject, {
    ...ctxBase,
    ...leadContext,
  });

  bodyHtml = renderTemplate(bodyHtml, {
    ...ctxBase,
    ...leadContext,
  });

  // Unsubscribe link injection (token must be present)
  if (!/%UNSUB%/i.test(bodyHtml)) throw new Error("Compliance: missing %UNSUB% token");
  const unsubBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://app.smartsendhq.com";
  const unsub = `${unsubBaseUrl}/api/unsub?e=${encodeURIComponent(Buffer.from(lead.email.toLowerCase(), "utf8").toString("base64"))}&t=${encodeURIComponent(trackingKey)}`;
  bodyHtml = bodyHtml.replace(
    /%UNSUB%/gi,
    `<p style="font-size:12px;color:#6b7280"><a href="${unsub}">Unsubscribe</a></p>`
  );

  if (!/To stop emails from us, click here/i.test(bodyHtml)) {
    bodyHtml += `<p style="font-size:12px;color:#6b7280;margin-top:16px;">&mdash;<br/>To stop emails from us, click here: <a href="${unsub}">${unsub}</a></p>`;
  }

  // Add open pixel (v2)
  bodyHtml += `<img src="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/o?k=${encodeURIComponent(trackingKey)}" width="1" height="1" style="display:none" alt="" />`;

  // Wrap links for click tracking
  bodyHtml = bodyHtml.replace(/href="(https?:\/\/[^\"]+)"/gi, (m, url) => {
    const wrapped = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/c?k=${encodeURIComponent(trackingKey)}&u=${encodeURIComponent(url)}`;
    return `href="${wrapped}"`;
  });

  // Message-ID for reply threading
  const messageId = makeMessageId();

  // Send via provided transport with bounce classification
  const unsubscribeMailto = `mailto:unsubscribe@smartsendhq.com?subject=${encodeURIComponent(outboundId)}`;
  try {
    await params.transportSend({
      to: lead.email,
      subject: renderedSubject,
      html: bodyHtml,
      headers: {
        "Message-ID": messageId,
        "In-Reply-To": messageId,
        "References": messageId,
        "List-Unsubscribe": `<${unsubscribeMailto}>, <${unsub}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e: any) {
    const cls = classifySendError(e);
    if (cls === "hard_bounce") {
      await addSuppression({
        owner: ownerId,
        email: lead.email,
        reason: "bounce",
        source: "send_error",
        details: { code: e?.responseCode, msg: e?.message },
      });
      await supabaseAdmin
        .from("send_events")
        .insert({ owner: ownerId, lead_id: lead.id, sequence_id: sequenceId, kind: "bounced" })
        .catch(() => {});
      return { skipped: true as const, reason: "bounced" as const };
    }
    throw e;
  }

  // Persist sent info
  await supabaseAdmin
    .from("outbound_messages")
    .update({ message_id: messageId, sent_at: new Date().toISOString() })
    .eq("id", outboundId);

  return { sent: true as const, outboundId };
}

async function isSequenceRunning(sequenceId: string, ownerId: string) {
  const { data } = await supabaseAdmin
    .from("sequences")
    .select("status")
    .eq("id", sequenceId)
    .eq("owner", ownerId)
    .single();
  return data?.status === "running";
}

