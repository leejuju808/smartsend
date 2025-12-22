"use server";

import { createClient } from "@/lib/supabase/server";
import { getCampaignLaunchReadiness } from "@/lib/smartsend/getCampaignLaunchReadiness";
import { getCampaignWithAccess } from "@/lib/smartsend/getCampaignWithAccess";

export async function startCampaign(campaignId: string) {
  const supabase = createClient();

  // Check campaign access
  const { user, campaign, role } = await getCampaignWithAccess(campaignId);

  if (!user) throw new Error("Not authenticated");
  if (!campaign) throw new Error("Campaign not found");
  if (role === "none" || role === "viewer") {
    throw new Error("You don't have permission to start this campaign.");
  }

  // 1) Run launch readiness check
  const readiness = await getCampaignLaunchReadiness(campaignId);

  if (!readiness.canLaunch) {
    // Bubble up a friendly error with all blocking messages
    const blocking = readiness.issues
      .filter((i) => i.level === "error")
      .map((i) => `• ${i.message}`)
      .join("\n");

    throw new Error(
      `Campaign cannot be started yet:\n${blocking}`
    );
  }

  // 2) If good, set status + next_run (as before)
  // Note: We can update without user_id check since we've already verified access
  await supabase
    .from("campaigns")
    .update({
      status: "running",
      next_run: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return { ok: true, readiness };
}

