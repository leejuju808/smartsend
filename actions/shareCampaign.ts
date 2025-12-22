"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getCampaignWithAccess } from "@/lib/smartsend/getCampaignWithAccess";

type ShareRole = "viewer" | "editor";

export async function shareCampaignByEmail(
  campaignId: string,
  email: string,
  role: ShareRole = "viewer"
) {
  const supabase = createClient();
  const admin = createAdminSupabaseClient();

  // Check current user + campaign access
  const { user, campaign, role: myRole } = await getCampaignWithAccess(campaignId);

  if (!user) throw new Error("Not authenticated");
  if (!campaign) throw new Error("Campaign not found");
  if (myRole !== "owner") {
    throw new Error("Only the campaign owner can manage sharing.");
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) throw new Error("Email is required");

  // Look up target user by email via admin client
  // Note: We need to list users and filter by email
  // Since admin client can't directly query auth.users, we use the admin API
  const { data: usersResponse, error: targetErr } = await admin.auth.admin.listUsers();

  if (targetErr) throw targetErr;
  
  const target = usersResponse.users.find(
    (u) => u.email?.toLowerCase() === trimmedEmail
  );

  if (!target) {
    throw new Error(
      "No SmartSend user found with that email. Ask your teammate to sign up first."
    );
  }

  if (target.id === user.id) {
    throw new Error("You are already the owner of this campaign.");
  }

  // Upsert share
  const { error: shareErr } = await supabase
    .from("smartsend_campaign_shares")
    .upsert(
      {
        campaign_id: campaignId,
        user_id: target.id,
        role,
      },
      { onConflict: "campaign_id,user_id" }
    );

  if (shareErr) throw shareErr;

  return { ok: true };
}

