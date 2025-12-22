import { NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await getUser(); 
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createSupabaseServer();
  const { data: seq, error: e1 } = await supabase
    .from("sequences")
    .select("id,name,created_at,workspace_id")
    .eq("id", params.id)
    .maybeSingle();
  if (e1 || !seq) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: steps, error: e2 } = await supabase
    .from("sequence_steps")
    .select("id,step_order,delay_hours,subject,body")
    .eq("sequence_id", seq.id).order("step_order");
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ sequence: seq, steps });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser(); 
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name } = await req.json();
  const supabase = createSupabaseServer();
  
  // Get sequence to find campaign_id
  const { data: seq } = await supabase
    .from("sequences")
    .select("campaign_id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  
  if (!seq) return NextResponse.json({ error: "Not found" }, { status: 404 });
  
  const { error } = await supabase.from("sequences").update({ name })
    .eq("id", params.id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Log version snapshot
  const { logSequenceVersion } = await import("@/lib/sequences/version-logger");
  await logSequenceVersion(params.id, seq.campaign_id, user.id, "edit");
  
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await getUser(); 
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createSupabaseServer();
  const { error } = await supabase.from("sequences").delete()
    .eq("id", params.id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}