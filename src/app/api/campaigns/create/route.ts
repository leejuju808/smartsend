import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  const { id, name, sender_account_id, sender_profile_id } = await req.json(); // id = uuid you pass from UI
  if (!id || !name) return NextResponse.json({ error: "Missing id/name" }, { status: 400 });

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: { 
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {}
      } 
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get current org_id from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_org_id")
    .eq("id", user.id)
    .single();

  const orgId = profile?.current_org_id;
  
  // Block 20900: Enforce campaign limit
  if (orgId) {
    const { enforceCampaignLimit } = await import('@/lib/billing/enforcement-20900');
    const limitError = await enforceCampaignLimit(orgId);
    if (limitError) {
      return limitError;
    }
  }

  // Fallback to old entitlement check if no org_id
  const { data: entitlements, error: entError } = await supabase.rpc("get_entitlements");
  if (!orgId && !entError) {
    const maxCampaigns = Number(entitlements?.max_campaigns ?? 0);
    const { count } = await supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    const currentCount = count ?? 0;

    if (maxCampaigns > 0 && currentCount >= maxCampaigns) {
      return NextResponse.json(
        {
          ok: false,
          code: "LIMIT_REACHED",
          message: `Your plan allows ${maxCampaigns} campaigns. Upgrade to create more.`,
        },
        { status: 402 }
      );
    }
  }

  const { error } = await supabase.from("campaigns").insert({ 
    id, 
    user_id: user.id, 
    name, 
    sender_account_id: sender_account_id || null,
    sender_profile_id: sender_profile_id || null,
    org_id: profile?.current_org_id || null
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id });
}