import { NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";

export async function GET(req: Request) {
  const { userId, status } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ status: "free" });

  // fetch trial_end from profiles
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("trial_end")
    .eq("id", userId)
    .maybeSingle();

  return NextResponse.json({ status, trial_end: data?.trial_end });
} 