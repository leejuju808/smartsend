import { createClient } from "@supabase/supabase-js";
import { mdToHtml } from "./email";
import { injectTracking } from "./tracking";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function enqueueApprovedDraft(draftId: string) {
  const { data: draft, error: dErr } = await supabase
    .from("email_drafts")
    .select("id, user_id, campaign_id, lead_id, subject, body_markdown, status, leads(email)")
    .eq("id", draftId)
    .single();
  if (dErr || !draft) throw new Error("Draft not found");
  if (draft.status !== "approved") throw new Error("Draft not approved");
  const toEmail = draft.leads?.email;
  if (!toEmail) throw new Error("Lead email missing");

  const baseUrl = process.env.PUBLIC_APP_URL!;
  // 1) markdown → html
  let html = mdToHtml(draft.body_markdown);

  // 2) preliminary tracking rewrite (with URL param u=)
  html = injectTracking({ html, campaignId: draft.campaign_id, leadId: draft.lead_id, baseUrl });

  // 3) Create link rows and replace ?u= with stable link_id
  const urls = Array.from(html.matchAll(/\/t\/c\?c=[^&]+&l=[^&]+&u=([^"&]+)/g)).map(m => decodeURIComponent(m[1]));
  const uniqueUrls = Array.from(new Set(urls));

  const linkRows = uniqueUrls.map(dest => ({
    campaign_id: draft.campaign_id,
    lead_id: draft.lead_id,
    dest_url: dest,
  }));
  if (linkRows.length) {
    const { data: inserted, error: insErr } = await supabase
      .from("email_links")
      .insert(linkRows)
      .select("id, dest_url");
    if (insErr) throw insErr;

    for (const row of inserted ?? []) {
      const safe = encodeURIComponent(row.dest_url);
      const re = new RegExp(`/t/c\\?c=${draft.campaign_id}&l=${draft.lead_id}&u=${safe}`, "g");
      html = html.replace(re, `/t/c?id=${row.id}`);
    }
  }

  // fetch campaign to stamp sender_account_id if set
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, sender_account_id")
    .eq("id", draft.campaign_id)
    .single();

  const { error: insQueueErr } = await supabase.from("send_queue").insert({
    user_id: draft.user_id,
    campaign_id: draft.campaign_id,
    lead_id: draft.lead_id,
    to_email: toEmail,
    subject: draft.subject,
    body_html: html,
    sender_account_id: campaign?.sender_account_id ?? null,
    status: "queued",
  });
  if (insQueueErr) throw insQueueErr;

  return { ok: true };
}