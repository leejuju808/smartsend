import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Get authenticated user
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // Get profile info with warmup data
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("daily_send_cap, warmup_level")
      .eq("id", userId)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Get today's send count
    const { data: dailyCount, error: countError } = await supabase.rpc('get_daily_send_count', {
      p_user_id: userId
    });

    if (countError) {
      console.error('Error getting daily send count:', countError);
    }

    // Get bounces in last 30 days - fix the query
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // First get user's campaign IDs
    const { data: userCampaigns } = await supabase
      .from("campaigns")
      .select("id")
      .eq("user_id", userId);
    
    const campaignIds = userCampaigns?.map(c => c.id) || [];
    
    // Then get bounces count for those campaigns
    const { count: bounces30d, error: bouncesError } = await supabase
      .from("bounces")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo)
      .in("campaign_id", campaignIds);

    if (bouncesError) {
      console.error('Error getting bounces count:', bouncesError);
    }

    // Calculate allowed sends based on warmup level
    const baseCap = 50; // starting daily cap
    const allowed = Math.min(baseCap * (profile.warmup_level || 1), profile.daily_send_cap || 200);

    return NextResponse.json({
      cap: profile.daily_send_cap || 200,
      warmup_level: profile.warmup_level || 1,
      used: dailyCount || 0,
      allowed: allowed,
      bounces_30d: bounces30d || 0,
      remaining: Math.max(0, allowed - (dailyCount || 0))
    });

  } catch (error) {
    console.error('Error in reputation API:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Allow POST for updating warmup settings
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const { daily_send_cap, warmup_level } = await req.json();

    // Validate inputs
    if (daily_send_cap && (typeof daily_send_cap !== 'number' || daily_send_cap < 1 || daily_send_cap > 10000)) {
      return NextResponse.json({ error: "Invalid daily_send_cap" }, { status: 400 });
    }

    if (warmup_level && (typeof warmup_level !== 'number' || warmup_level < 1 || warmup_level > 30)) {
      return NextResponse.json({ error: "Invalid warmup_level" }, { status: 400 });
    }

    // Update profile
    const updateData: any = {};
    if (daily_send_cap !== undefined) updateData.daily_send_cap = daily_send_cap;
    if (warmup_level !== undefined) updateData.warmup_level = warmup_level;

    const { error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", userId);

    if (error) {
      console.error('Error updating profile:', error);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: updateData });

  } catch (error) {
    console.error('Error updating reputation settings:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 