import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  const { sequenceId, steps } = await req.json();
  const cookieStore = cookies();
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies:{ get:(k)=>cookieStore.get(k)?.value }});
  const { data:{ user }} = await sb.auth.getUser(); 
  if(!user) return NextResponse.json({ error:"Unauthorized" }, { status:401 });

  // Verify user owns the sequence and get campaign_id
  const { data: sequence } = await sb.from("sequences").select("id, campaign_id").eq("id", sequenceId).eq("user_id", user.id).single();
  if (!sequence) return NextResponse.json({ error:"Sequence not found" }, { status:404 });

  // Delete existing steps
  await sb.from("sequence_steps").delete().eq("sequence_id", sequenceId);

  // Insert new steps
  const stepsWithSequenceId = steps.map((step: any) => ({
    ...step,
    sequence_id: sequenceId
  }));

  const { error } = await sb.from("sequence_steps").insert(stepsWithSequenceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  
  // Log version snapshot
  const { logSequenceVersion } = await import("@/lib/sequences/version-logger");
  await logSequenceVersion(sequenceId, sequence.campaign_id || null, user.id, "upsert_steps");
  
  return NextResponse.json({ success: true });
}