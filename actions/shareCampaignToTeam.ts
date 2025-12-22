"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateMyTeam } from "./getOrCreateMyTeam";

export async function shareCampaignToTeam(campaignId: string) {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const team = await getOrCreateMyTeam();

  // Ensure user owns this campaign (MVP rule)
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (cErr || !campaign) throw new Error("Campaign not found");

  if (campaign.user_id !== user.id) throw new Error("Only owner can share campaign");

  const { error: updErr } = await supabase
    .from("campaigns")
    .update({
      team_id: team.id,
      visibility: "team"
    })
    .eq("id", campaignId);

  if (updErr) throw updErr;

  return { ok: true };
}

export async function makeCampaignPrivate(campaignId: string) {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (!campaign || campaign.user_id !== user.id) throw new Error("Not allowed");

  await supabase
    .from("campaigns")
    .update({ visibility: "private", team_id: null })
    .eq("id", campaignId);

  return { ok: true };
}








