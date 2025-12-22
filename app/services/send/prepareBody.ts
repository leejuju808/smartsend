import { JSDOM } from "jsdom";
import { makeToken, buildTrackedUrl } from "@/libs/tracking/urls";
import { supabaseAdmin } from "@/lib/supabase/admin";

type UTMKeys = "utm_source" | "utm_medium" | "utm_campaign" | "utm_content";

type RewriteArgs = {
  accountId: string;
  campaignId?: string;
  leadId?: string;
  messageId?: string;
  html: string;
  trackingDomain: string;
  utm?: Partial<Record<UTMKeys, string>>;
};

export async function rewriteLinks({
  accountId,
  campaignId,
  leadId,
  messageId,
  html,
  trackingDomain,
  utm,
}: RewriteArgs) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const anchors = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>("a[href^='http']")
  );

  for (const a of anchors) {
    const original = new URL(a.href);

    if (utm) {
      for (const [key, value] of Object.entries(utm)) {
        if (value) {
          original.searchParams.set(key, value);
        }
      }
    }

    const token = makeToken();

    await supabaseAdmin.from("message_links").insert({
      account_id: accountId,
      campaign_id: campaignId ?? null,
      lead_id: leadId ?? null,
      message_id: messageId ?? null,
      original_url: original.toString(),
      token,
      utm_source: utm?.utm_source ?? null,
      utm_medium: utm?.utm_medium ?? null,
      utm_campaign: utm?.utm_campaign ?? null,
      utm_content: utm?.utm_content ?? null,
    });

    a.href = buildTrackedUrl(trackingDomain, token);
    a.setAttribute("rel", "noopener noreferrer");
  }

  return doc.documentElement.outerHTML;
}

type UnsubscribeArgs = {
  accountId: string;
  campaignId?: string;
  leadId?: string;
  messageId?: string;
  trackingDomain: string;
};

export async function makeUnsubscribeLink({
  accountId,
  campaignId,
  leadId,
  messageId,
  trackingDomain,
}: UnsubscribeArgs) {
  const token = makeToken();

  await supabaseAdmin.from("message_links").insert({
    account_id: accountId,
    campaign_id: campaignId ?? null,
    lead_id: leadId ?? null,
    message_id: messageId ?? null,
    original_url: `${process.env.APP_URL}/unsubscribe`,
    token,
    is_unsubscribe: true,
  });

  return buildTrackedUrl(trackingDomain, token);
}




