"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";

const InviteSchema = z.object({
  campaignId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["viewer","sender","admin"])
});

export async function inviteToCampaign(_: any, formData: FormData) {
  const { campaignId, email, role } = InviteSchema.parse({
    campaignId: formData.get("campaignId"),
    email: formData.get("email"),
    role: formData.get("role")
  });

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: any) {
          cookieStore.set(name, "", { ...options, maxAge: 0 });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Only an admin on this campaign can invite
  const { data: access } = await supabase
    .from("v_campaign_access")
    .select("role")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!access || access.role !== "admin") throw new Error("Not authorized");

  // Ensure team exists and the invitee is (or will be) in team
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("team_id")
    .eq("id", campaignId)
    .single();

  if (!campaign) throw new Error("Campaign not found");

  // Lookup user by email - try to find existing user
  // Note: This requires either service role or a public users view
  // For MVP, we'll use service role client if available
  let invitedUserId: string | null = null;

  // First, try to find user via profiles or public users table if it exists
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (profile) {
    invitedUserId = profile.id;
  } else {
    // If service role is available, use it to check auth.users
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: { users } } = await adminSupabase.auth.admin.listUsers();
      const inviteUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (inviteUser) {
        invitedUserId = inviteUser.id;
      }
    }
  }

  if (!invitedUserId) {
    throw new Error(
      `User with email ${email} not found. Please ask them to sign up first. ` +
      `For automatic invitations, set up a Supabase Edge Function with service role access.`
    );
  }

  // Add to team (viewer by default if not present) if campaign has a team
  if (campaign.team_id) {
    const { error: teamError } = await supabase
      .from("team_members")
      .upsert(
        {
          team_id: campaign.team_id,
          user_id: invitedUserId,
          role: role === "admin" ? "sender" : "viewer"
        },
        { onConflict: "team_id,user_id" }
      );

    if (teamError) {
      console.error("Failed to add to team:", teamError);
      // Continue anyway - per-campaign role will still work
    }
  }

  // Grant per-campaign role
  const { error: campaignError } = await supabase
    .from("campaign_members")
    .upsert(
      {
        campaign_id: campaignId,
        user_id: invitedUserId,
        role
      },
      { onConflict: "campaign_id,user_id" }
    );

  if (campaignError) {
    throw new Error(`Failed to add campaign member: ${campaignError.message}`);
  }

  return { invited: true, userId: invitedUserId };
}

