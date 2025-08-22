import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getEntitlements } from "@/lib/entitlements";

function getUserId(req: Request) { return new URL(req.url).searchParams.get("userId"); }

export async function GET(req: Request) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("subscription_status")
    .eq("id", userId)
    .single();

  const ents = getEntitlements(prof?.subscription_status);

  const { count: seqCount } = await supabaseAdmin
    .from("sequences")
    .select("id", { count: "exact", head: true })
    .eq("owner", userId)
    .neq("status", "demo");

  return NextResponse.json({
    plan: ents.plan,
    daily_limit: ents.daily_limit,
    max_sequences: ents.max_sequences,
    max_steps_per_sequence: ents.max_steps_per_sequence,
    used: { sequences: seqCount ?? 0 },
  });
}

