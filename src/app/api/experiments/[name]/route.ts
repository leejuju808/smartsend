import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function GET(
  req: NextRequest,
  { params }: { params: { name: string } }
) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  // get experiment
  const { data: exp } = await supabaseAdmin
    .from("experiments")
    .select("*")
    .eq("name", params.name)
    .maybeSingle();
  if (!exp) return NextResponse.json({ error: "No experiment" }, { status: 404 });

  // check assignment
  const { data: existing } = await supabaseAdmin
    .from("experiment_assignments")
    .select("variant")
    .eq("user_id", userId)
    .eq("experiment_id", exp.id)
    .maybeSingle();

  if (existing) return NextResponse.json({ variant: existing.variant, id: exp.id });

  // assign weighted random
  const variants = exp.variants as any[];
  let r = Math.random();
  let chosen = variants[0].key;
  for (const v of variants) {
    if (r < v.weight) {
      chosen = v.key;
      break;
    }
    r -= v.weight;
  }
  
  await supabaseAdmin
    .from("experiment_assignments")
    .insert({ user_id: userId, experiment_id: exp.id, variant: chosen });
  
  return NextResponse.json({ variant: chosen, id: exp.id });
} 