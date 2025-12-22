import { NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function DELETE(_: Request, { params }: { params: { id: string, stepId: string } }) {
  const user = await getUser(); 
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createSupabaseServer();

  // ensure ownership via join
  const { data: step } = await supabase
    .from("sequence_steps")
    .select("id, sequence_id, sequences!inner(user_id)")
    .eq("id", params.stepId).eq("sequence_id", params.id).maybeSingle();

  if (!step || (step as any).sequences.user_id !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("sequence_steps").delete().eq("id", params.stepId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}