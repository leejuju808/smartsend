import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function POST(req: Request) {
  try {
    // Verify the request is from a cron job or has the proper auth
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get today's date
    const today = new Date().toISOString().split("T")[0];

    // Calculate signups for today
    const { count: signups } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("created_at::date", today);

    // Calculate activated users (completed onboarding)
    const { count: activated } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("onboarding_complete", true);

    // Calculate upgraded users (non-free plan)
    const { count: upgraded } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .not("subscription_status", "eq", "free")
      .not("plan", "eq", "free");

    // Calculate 30-day retention (users who signed up 30 days ago and are still active)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: signups30dAgo } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("created_at::date", thirtyDaysAgo.toISOString().split("T")[0]);

    let retention30d = 0;
    if (signups30dAgo && signups30dAgo.length > 0) {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .in("id", signups30dAgo.map(p => p.id))
        .not("subscription_status", "eq", "canceled");
      retention30d = count || 0;
    }

    const retentionRate =
      signups30dAgo && signups30dAgo.length > 0
        ? (retention30d / signups30dAgo.length) * 100
        : 0;

    // Upsert stats for today
    await supabaseAdmin
      .from("activation_stats")
      .upsert(
        {
          date: today,
          signups: signups || 0,
          activated: activated || 0,
          upgraded: upgraded || 0,
          retention_30d: retentionRate,
        },
        { onConflict: "date" }
      );

    return NextResponse.json({
      ok: true,
      message: "Activation stats updated",
      stats: {
        signups: signups || 0,
        activated: activated || 0,
        upgraded: upgraded || 0,
        retention_30d: retentionRate,
      },
    });
  } catch (error) {
    console.error("Error updating activation stats:", error);
    return NextResponse.json(
      { error: "Failed to update activation stats" },
      { status: 500 }
    );
  }
}

