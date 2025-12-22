import { createClient } from "@/lib/supabase/server";
import { resolvePromptPack } from "./resolve";

/**
 * Stamps prompt pack versions on scheduled_messages when enqueueing.
 * Should be called before inserting scheduled_messages rows.
 */
export async function stampPromptVersions(opts: {
  campaignId: string;
  stepNumber?: number | null;
  scheduledMessageId: string;
}): Promise<void> {
  const sb = createClient();

  // Resolve all three pack types
  const [rewritePack, policyPack, guardrailsPack] = await Promise.all([
    resolvePromptPack({
      campaignId: opts.campaignId,
      stepNumber: opts.stepNumber,
      kind: "rewrite",
    }),
    resolvePromptPack({
      campaignId: opts.campaignId,
      stepNumber: opts.stepNumber,
      kind: "policy",
    }),
    resolvePromptPack({
      campaignId: opts.campaignId,
      stepNumber: opts.stepNumber,
      kind: "guardrails",
    }),
  ]);

  // Update scheduled_messages with version stamps
  const updates: Record<string, any> = {};

  if (rewritePack) {
    updates.rewrite_pack_id = rewritePack.pack_id;
    updates.rewrite_prompt_version = rewritePack.version;
  }

  if (policyPack) {
    updates.policy_pack_id = policyPack.pack_id;
    updates.policy_prompt_version = policyPack.version;
  }

  if (guardrailsPack) {
    updates.guardrails_pack_id = guardrailsPack.pack_id;
    updates.guardrails_prompt_version = guardrailsPack.version;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await sb
      .from("scheduled_messages")
      .update(updates)
      .eq("id", opts.scheduledMessageId);

    if (error) {
      console.error("Failed to stamp prompt versions:", error);
      // Don't throw - version stamping is best-effort audit trail
    }
  }
}















