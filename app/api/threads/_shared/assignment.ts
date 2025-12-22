import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export async function getSessionUserId() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
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

  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function ensureCanAssign(campaignId: string, userId: string | null) {
  if (!userId) {
    return false;
  }

  const service = createServiceClient();

  const { data: campaign } = await service
    .from("campaigns")
    .select("user_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaign?.user_id === userId) {
    return true;
  }

  const { data: member } = await service
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();

  return member?.role === "owner" || member?.role === "editor";
}








