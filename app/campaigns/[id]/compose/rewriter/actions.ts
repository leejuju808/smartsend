"use server";

import { createClient } from "@/utils/supabase/server";
import { z } from "zod";
import { getTeamPlan, getMonthUsage, used } from "@/lib/billing/limits";

const Schema = z.object({
  campaignId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  subject: z.string().min(3),
  body: z.string().min(20),
  tone: z.string().optional(),
  length: z.enum(["short","medium","long"]).optional(),
  variants: z.coerce.number().min(1).max(5).optional()
});

export async function rewriteTemplate(_: any, formData: FormData) {
  const input = Schema.parse({
    campaignId: formData.get("campaignId"),
    templateId: formData.get("templateId") || undefined,
    subject: formData.get("subject"),
    body: formData.get("body"),
    tone: formData.get("tone") || undefined,
    length: formData.get("length") || undefined,
    variants: formData.get("variants") || 3
  });

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // ensure access (admin or sender)
  const { data: access } = await sb.from("v_campaign_access")
    .select("role").eq("campaign_id", input.campaignId).eq("user_id", user.id).maybeSingle();
  if (!access || !["sender","admin"].includes(access.role)) throw new Error("Unauthorized");

  // Get campaign info for plan gates
  const { data: campaign } = await sb
    .from("campaigns")
    .select("team_id")
    .eq("id", input.campaignId)
    .maybeSingle();

  // Plan gates: check AI rewrite quota
  if (campaign?.team_id) {
    const plan = await getTeamPlan(campaign.team_id);
    if (!plan) {
      throw new Error("Unable to determine plan limits.");
    }

    const usage = await getMonthUsage(campaign.team_id);
    const usedAI = used(usage, "ai_rewrite");
    const requestedVariants = input.variants ?? 3;
    const limitAI = plan.ai_rewrites_month;

    if (usedAI + requestedVariants > limitAI) {
      throw new Error(
        `AI rewrite limit reached. You've used ${usedAI}/${limitAI} rewrites this month on your ${plan.plan} plan. Upgrade to generate more variants.`
      );
    }
  }

  const body = {
    campaignId: input.campaignId,
    templateId: input.templateId ?? null,
    base: { subject: input.subject, body: input.body },
    options: { tone: input.tone ?? "concise", length: input.length ?? "medium", variants: input.variants ?? 3 }
  };

  // Construct Supabase function URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const functionUrl = `${supabaseUrl}/functions/v1/ai-rewrite`;

  const res = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "x-ss-secret": process.env.AI_SECRET!,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`Rewrite failed: ${await res.text()}`);
  }
  const { variants } = await res.json();

  // ensure parent template exists
  let templateId = input.templateId;
  if (!templateId) {
    const { data: t } = await sb.from("email_templates").insert({
      campaign_id: input.campaignId,
      subject: input.subject,
      body: input.body,
      created_by: user.id
    })
    .select("id").single();
    templateId = t!.id;
  }

  // store versions
  const rows = variants.map((v: any) => ({
    template_id: templateId!,
    variant_key: v.variant_key,
    subject: v.subject,
    body: v.body,
    tone: body.options.tone,
    length: body.options.length,
    score: v.score,
    created_by: user.id
  }));

  const { error: insErr } = await sb.from("template_versions").upsert(rows, { onConflict: "template_id,variant_key" });
  if (insErr) throw insErr;

  // Track usage for billing (after storing variants)
  // Note: usage_events may not exist, but variants are tracked via v_usage_month view based on template_versions
  try {
    // Tracking is automatic via template_versions table and v_usage_month view
    // No explicit insert needed if using the view
  } catch (usageErr) {
    console.error("Failed to track AI rewrite usage:", usageErr);
    // Don't fail the rewrite if usage tracking fails
  }

  return { templateId, variants };
}

export async function useVariant(_: any, formData: FormData) {
  const sb = createClient();
  const campaignId = String(formData.get("campaignId"));
  const templateId = String(formData.get("templateId"));
  const variantKey = String(formData.get("variant"));

  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: v } = await sb.from("template_versions")
    .select("subject, body, template_id")
    .eq("template_id", templateId)
    .eq("variant_key", variantKey)
    .single();

  if (!v) throw new Error("Variant not found");

  // write to campaign's active subject/body
  const { data: t } = await sb.from("email_templates").select("campaign_id").eq("id", templateId).single();
  if (!t || t.campaign_id !== campaignId) throw new Error("Template mismatch");

  await sb.from("campaigns").update({
    subject: v.subject,
    body_template: v.body
  }).eq("id", campaignId);

  return { ok: true };
}

