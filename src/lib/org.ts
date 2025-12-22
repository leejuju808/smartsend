import { cookies } from "next/headers";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { createServerClient } from '@supabase/ssr';

// Server-side Supabase client with SSR support
export async function serverSB() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

export function getActiveOrgId() {
  return cookies().get("org_id")?.value || null;
}

export function setActiveOrgId(res: Response, orgId: string) {
  // in your api route, set cookie via NextResponse
}

export type ActiveOrg = { id: string; name: string; role: "owner" | "admin" | "member" };

// Get current org using RPC function
export async function getCurrentOrg(): Promise<string | null> {
  const sb = await serverSB();
  const { data, error } = await sb.rpc('fn_current_org');
  if (error || !data) return null;
  return data;
}

// List all orgs user is a member of
export async function listMyOrgs(): Promise<Array<{ id: string; name: string; role: string; is_current: boolean }>> {
  const sb = await serverSB();
  const { data, error } = await sb.rpc('fn_list_my_orgs');
  if (error || !data) return [];
  return data;
}

// Switch to a different org
export async function switchOrg(orgId: string): Promise<boolean> {
  const sb = await serverSB();
  const { error } = await sb.rpc('fn_set_current_org', { p_org_id: orgId });
  return !error;
}

export async function getActiveOrg(): Promise<ActiveOrg | null> {
  const orgId = await getCurrentOrg();
  if (!orgId) return null;
  
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Get org details
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role, orgs!inner(id, name)")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();
  
  if (membership) {
    return {
      id: membership.org_id,
      name: (membership.orgs as any).name,
      role: membership.role as "owner" | "admin" | "member"
    };
  }

  return null;
}
