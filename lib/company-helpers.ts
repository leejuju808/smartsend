import { cookies, headers } from "next/headers";
import { getServerSupabase } from "@/src/lib/supabase/server";

/**
 * Get the current roofing company ID for the authenticated user
 */
export async function getCurrentCompanyId(): Promise<string | null> {
  const cookieStore = await cookies();
  const companyId = cookieStore.get("current_company_id")?.value || headers().get("x-company-id") || null;
  
  if (companyId) return companyId;

  // Fallback: get user's first active roofing company
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("roofing_company_members")
    .select("roofing_company_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.roofing_company_id || null;
}

/**
 * Get all roofing companies for the authenticated user
 */
export async function getUserRoofingCompanies(): Promise<Array<{ id: string; name: string }>> {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase
    .from("roofing_company_members")
    .select(`
      roofing_company_id,
      roofing_companies:roofing_company_id (
        id,
        name
      )
    `)
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (!memberships) return [];

  return memberships
    .filter((m: any) => m.roofing_companies)
    .map((m: any) => ({
      id: m.roofing_company_id,
      name: m.roofing_companies.name,
    }));
}


























