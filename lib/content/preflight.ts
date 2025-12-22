// lib/content/preflight.ts
// Preflight service used by composer & UI "Test"

import { createClient } from "@supabase/supabase-js";
import { validateBrand } from "./brandGuardrails";
import crypto from "crypto";

// Create a server client for use in API routes
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    },
  );
}

export async function runPreflight({
  campaignId,
  contactId,
  templateId,
  variantId,
  subject,
  body,
  tone,
}: {
  campaignId: string;
  contactId?: string | null;
  templateId?: string | null;
  variantId?: string | null;
  subject: string;
  body: string;
  tone?: string | null;
}) {
  const sb = getSupabaseClient();

  // Get account_id from campaign
  const { data: campaign } = await sb
    .from("campaigns")
    .select("account_id, user_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  const accountId = campaign.account_id || campaign.user_id;

  // Load style (campaign→account fallback)
  const { data: bsgCampaign } = await sb
    .from("brand_style_guides")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("scope", "campaign")
    .maybeSingle();

  const { data: bsgAccount } = await sb
    .from("brand_style_guides")
    .select("*")
    .eq("account_id", accountId)
    .eq("scope", "account")
    .is("campaign_id", null)
    .maybeSingle();

  // Prefer campaign-specific over account-wide
  const bsg = bsgCampaign || bsgAccount;

  const style = {
    length_limits: bsg?.length_limits ?? { subject_max: 100, body_max: 2000 },
    required_tags: bsg?.required_tags ?? ["{{first_name}}"],
    can_include_links: bsg?.can_include_links ?? true,
    formatting_rules: bsg?.formatting_rules ?? "",
  };

  // Load phrase banks (campaign-specific first, then account-wide)
  const { data: allowCampaign } = await sb
    .from("brand_phrase_bank")
    .select("phrase")
    .eq("campaign_id", campaignId)
    .eq("kind", "allow");

  const { data: denyCampaign } = await sb
    .from("brand_phrase_bank")
    .select("phrase")
    .eq("campaign_id", campaignId)
    .eq("kind", "deny");

  const { data: allowAccount } = await sb
    .from("brand_phrase_bank")
    .select("phrase")
    .eq("account_id", accountId)
    .is("campaign_id", null)
    .eq("kind", "allow");

  const { data: denyAccount } = await sb
    .from("brand_phrase_bank")
    .select("phrase")
    .eq("account_id", accountId)
    .is("campaign_id", null)
    .eq("kind", "deny");

  // Merge campaign and account phrases (campaign takes precedence)
  const allow = [
    ...(allowCampaign?.map((x) => x.phrase) ?? []),
    ...(allowAccount?.map((x) => x.phrase) ?? []),
  ];
  const deny = [
    ...(denyCampaign?.map((x) => x.phrase) ?? []),
    ...(denyAccount?.map((x) => x.phrase) ?? []),
  ];

  const res = validateBrand({
    subject,
    body,
    style,
    allow,
    deny,
  });

  const content_hash = crypto
    .createHash("sha256")
    .update(subject + "\n" + body)
    .digest("hex");

  // Determine status: failed if any blocking issues, warn if only warnings
  const hasBlocking = res.issues.some(
    (i) =>
      i.code === "MISSING_TAG" ||
      i.code === "SUBJECT_TOO_LONG" ||
      i.code === "BODY_TOO_LONG" ||
      i.code === "LINKS_BLOCKED" ||
      i.code === "FORBIDDEN_PHRASE",
  );
  const status = hasBlocking ? "failed" : res.issues.length > 0 ? "warn" : "passed";

  await sb.from("send_preflight_logs").insert({
    campaign_id: campaignId,
    contact_id: contactId ?? null,
    template_id: templateId ?? null,
    template_variant_id: variantId ?? null,
    tone_used: tone ?? null,
    status,
    issues: res.issues,
    content_hash,
  });

  return res;
}

