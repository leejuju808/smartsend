import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export type CampaignRole = "owner" | "editor" | "viewer" | "none";

export async function getCampaignRole(campaignId: string): Promise<CampaignRole> {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  // Get current user
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return "none";

  // Use the database function to compute role
  const { data: roleData, error } = await sb.rpc("user_campaign_role", {
    p_campaign: campaignId,
  });

  if (error) {
    console.error("Error getting campaign role:", error);
    return "none";
  }

  return (roleData as CampaignRole) ?? "none";
}

