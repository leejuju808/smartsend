import { createClient } from "@/lib/supabase/server";

type Kind = "rewrite" | "policy" | "guardrails";

export interface ResolvedPromptPack {
  pack_id: string;
  version: number;
  system_prompt: string;
  user_template: string | null;
  config: Record<string, any> | null;
}

/**
 * Resolves the active prompt pack for a campaign and step.
 * Priority: step-specific override > campaign-wide override > latest active pack for account
 */
export async function resolvePromptPack(opts: {
  campaignId: string;
  stepNumber?: number | null;
  kind: Kind;
}): Promise<ResolvedPromptPack | null> {
  const sb = createClient();

  // If step_number is provided, try to get step-specific override first
  if (opts.stepNumber != null) {
    const { data: stepOverride } = await sb
      .from("campaign_prompt_overrides")
      .select("pack_id, version")
      .eq("campaign_id", opts.campaignId)
      .eq("kind", opts.kind)
      .eq("step_number", opts.stepNumber)
      .maybeSingle();

    if (stepOverride) {
      const { data: version } = await sb
        .from("prompt_pack_versions")
        .select("system_prompt, user_template, config, pack_id, version")
        .eq("pack_id", stepOverride.pack_id)
        .eq("version", stepOverride.version)
        .single();

      if (version) {
        return {
          pack_id: version.pack_id,
          version: version.version,
          system_prompt: version.system_prompt,
          user_template: version.user_template,
          config: version.config as Record<string, any> | null,
        };
      }
    }
  }

  // Check for campaign-wide override (step_number is null)
  const { data: campaignOverride } = await sb
    .from("campaign_prompt_overrides")
    .select("pack_id, version")
    .eq("campaign_id", opts.campaignId)
    .eq("kind", opts.kind)
    .is("step_number", null)
    .maybeSingle();

  if (campaignOverride) {
    const { data: version } = await sb
      .from("prompt_pack_versions")
      .select("system_prompt, user_template, config, pack_id, version")
      .eq("pack_id", campaignOverride.pack_id)
      .eq("version", campaignOverride.version)
      .single();

    if (version) {
      return {
        pack_id: version.pack_id,
        version: version.version,
        system_prompt: version.system_prompt,
        user_template: version.user_template,
        config: version.config as Record<string, any> | null,
      };
    }
  }

  // 2. Default: latest active pack for account/kind via RPC
  const { data: latestPack, error } = await sb.rpc(
    "get_latest_active_pack_for_campaign",
    {
      campaign_id: opts.campaignId,
      kind: opts.kind,
    }
  );

  if (error || !latestPack || latestPack.length === 0) {
    return null;
  }

  const pack = latestPack[0];
  return {
    pack_id: pack.pack_id,
    version: pack.version,
    system_prompt: pack.system_prompt,
    user_template: pack.user_template,
    config: pack.config as Record<string, any> | null,
  };
}

