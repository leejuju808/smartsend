import { NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";

export async function GET() {
  const { userId, status } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });
  
  const { data } = await supabaseAdmin
    .from("extension_tokens")
    .select("id, last_used_at, expires_at, revoked, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const has_token = !!data && !data.revoked && (!data.expires_at || new Date(data.expires_at) > new Date());

  // Increment trial extension days if user is trialing and token is used
  if (has_token && status === "trialing" && data?.last_used_at) {
    const lastUsed = new Date(data.last_used_at);
    const today = new Date();
    const isNewDay = lastUsed.toDateString() !== today.toDateString();
    
    if (isNewDay) {
      try {
        await supabaseAdmin.rpc("increment_trial_extension", { uid: userId });
        // Update last_used_at to prevent multiple increments on the same day
        await supabaseAdmin
          .from("extension_tokens")
          .update({ last_used_at: today.toISOString() })
          .eq("id", data.id);
      } catch (error) {
        // Don't fail if trial counting fails
        console.warn('Trial extension counting error:', error);
      }
    }
  }

  return NextResponse.json({
    has_token,
    last_used_at: data?.last_used_at || null,
    expires_at: data?.expires_at || null,
    revoked: data?.revoked ?? null,
  });
} 