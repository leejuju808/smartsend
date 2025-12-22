"use server";
import { createClient } from "@/utils/supabase/server";
import { randomBytes } from "crypto";

function newToken() {
  return randomBytes(8).toString("hex"); // 16-char token
}

export async function wrapTracking({
  accountId, campaignId, sendId, emailId, leadId, html
}: {
  accountId: string; campaignId?: string|null; sendId?: string|null; emailId?: string|null; leadId?: string|null; html: string;
}) {
  const sb = createClient();
  
  // Check if tracking is enabled for this account
  const { data: account } = await sb.from("accounts").select("tracking_enabled").eq("id", accountId).single();
  if (account && account.tracking_enabled === false) {
    return html; // Return original HTML without tracking
  }

  // 1) replace all links
  const urls = Array.from(new Set(html.match(/https?:\/\/[^\s"'<>)]+/gi) || []));
  let out = html;
  for (const u of urls) {
    const token = newToken();
    await sb.from("tracking_links").insert({
      account_id: accountId, campaign_id: campaignId, send_id: sendId, email_id: emailId, lead_id: leadId,
      token, dest_url: u
    });
    const tracked = `${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/track-click/${token}?a=${accountId}${campaignId ? `&c=${campaignId}` : ""}${sendId ? `&s=${sendId}` : ""}${emailId ? `&e=${emailId}` : ""}${leadId ? `&l=${leadId}` : ""}`;
    out = out.replaceAll(u, tracked);
  }

  // 2) append open pixel
  const px = `${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/track-open?t=${sendId || ""}&a=${accountId}${campaignId ? `&c=${campaignId}` : ""}${emailId ? `&e=${emailId}` : ""}${leadId ? `&l=${leadId}` : ""}`;
  const img = `<img src="${px}" width="1" height="1" style="display:none" alt="" />`;

  if (out.includes("</body>")) out = out.replace("</body>", img + "</body>");
  else out += img;

  return out;
}

