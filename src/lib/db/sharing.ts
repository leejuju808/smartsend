import { createClient } from "@supabase/supabase-js";

export async function getMembersAndInvites(campaignId: string) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [{ data: members }, { data: invites }] = await Promise.all([
    admin
      .from("campaign_members")
      .select("user_id, role, created_at")
      .eq("campaign_id", campaignId),
    admin
      .from("campaign_invites")
      .select("id, email, role, status, created_at, expires_at, invited_by, updated_at, accepted_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
  ]);

  return { members: members ?? [], invites: invites ?? [] };
}



