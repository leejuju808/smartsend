import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function POST(req: NextRequest) {
  const { userId, status } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });
  
  // Only allow admin users (pro users with @smartsend.ai email)
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();
  
  if (!profile?.email?.endsWith("@smartsend.ai")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { name, variants } = await req.json();
  if (!name || !variants || !Array.isArray(variants)) {
    return NextResponse.json({ error: "Missing name or variants array" }, { status: 400 });
  }

  // Validate variants structure
  for (const variant of variants) {
    if (!variant.key || typeof variant.weight !== "number" || variant.weight <= 0) {
      return NextResponse.json({ error: "Invalid variant structure" }, { status: 400 });
    }
  }

  // Check if weights sum to approximately 1.0
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    return NextResponse.json({ error: "Variant weights must sum to 1.0" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("experiments")
    .insert({ name, variants })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, experiment: data });
} 