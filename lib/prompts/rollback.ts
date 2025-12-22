import { createClient } from "@/lib/supabase/server";

/**
 * Auto-rollback to previous passing version if preflight fails after version bump.
 * Should be called when preflight check fails.
 */
export async function rollbackPromptVersion(opts: {
  campaignId: string;
  kind: "rewrite" | "policy" | "guardrails";
  stepNumber?: number | null;
  failedVersion: number;
  packId: string;
}): Promise<{ rolledBack: boolean; previousVersion?: number }> {
  const sb = createClient();

  // Find the previous version that was used successfully
  // Look for scheduled_messages with this pack that were sent successfully
  const { data: previousMessages } = await sb
    .from("scheduled_messages")
    .select(
      kind === "rewrite"
        ? "rewrite_prompt_version"
        : kind === "policy"
        ? "policy_prompt_version"
        : "guardrails_prompt_version"
    )
    .eq("campaign_id", opts.campaignId)
    .eq(
      kind === "rewrite"
        ? "rewrite_pack_id"
        : kind === "policy"
        ? "policy_pack_id"
        : "guardrails_pack_id",
      opts.packId
    )
    .not(
      kind === "rewrite"
        ? "rewrite_prompt_version"
        : kind === "policy"
        ? "policy_prompt_version"
        : "guardrails_prompt_version",
      "is",
      null
    )
    .order("created_at", { ascending: false })
    .limit(10);

  if (!previousMessages || previousMessages.length === 0) {
    return { rolledBack: false };
  }

  // Find the most recent version that's not the failed version
  const versionField =
    kind === "rewrite"
      ? "rewrite_prompt_version"
      : kind === "policy"
      ? "policy_prompt_version"
      : "guardrails_prompt_version";

  const previousVersion = previousMessages.find(
    (m: any) => m[versionField] !== opts.failedVersion
  )?.[versionField] as number | undefined;

  if (!previousVersion) {
    return { rolledBack: false };
  }

  // Rollback the override to previous version
  const { error } = await sb
    .from("campaign_prompt_overrides")
    .upsert(
      {
        campaign_id: opts.campaignId,
        step_number: opts.stepNumber ?? null,
        kind: opts.kind,
        pack_id: opts.packId,
        version: previousVersion,
      },
      {
        onConflict: "campaign_id,step_number,kind",
      }
    );

  if (error) {
    console.error("Failed to rollback prompt version:", error);
    return { rolledBack: false };
  }

  // Log rollback event
  await sb.from("system_logs").insert({
    category: "prompt_packs",
    level: "warn",
    message: `Prompt pack version rolled back: ${opts.kind} pack ${opts.packId} from v${opts.failedVersion} to v${previousVersion}`,
    context: {
      campaign_id: opts.campaignId,
      kind: opts.kind,
      failed_version: opts.failedVersion,
      rolled_back_to: previousVersion,
      step_number: opts.stepNumber,
      pack_id: opts.packId,
    },
  });

  return { rolledBack: true, previousVersion };
}

