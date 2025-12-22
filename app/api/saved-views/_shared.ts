import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceSupabaseClient = SupabaseClient<any, "public", any>;

export type ViewMembershipRole = "viewer" | "editor" | "owner" | null;

export function createServiceSupabase(): ServiceSupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function resolveViewMembershipRole(
  service: ServiceSupabaseClient,
  viewId: string,
  userId: string,
  ownerId: string | null
): Promise<ViewMembershipRole> {
  if (ownerId === userId) {
    return "owner";
  }

  const { data: membership } = await service
    .from("saved_view_memberships")
    .select("role")
    .eq("view_id", viewId)
    .eq("user_id", userId)
    .maybeSingle();

  return (membership?.role as ViewMembershipRole) ?? null;
}

