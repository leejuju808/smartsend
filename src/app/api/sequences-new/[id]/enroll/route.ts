import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser(); 
  if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const body = await req.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows : [body];
  if (!rows.length) return NextResponse.json({ ok:false, error:"no rows" }, { status:400 });

  // verify ownership
  const { data: seq } = await supabase
    .from("sequences")
    .select("workspace_id,status")
    .eq("id", params.id)
    .single();
    
  if (!seq || seq.workspace_id !== u.user.id) 
    return NextResponse.json({ ok:false, error:"Not found" }, { status:404 });
    
  if (seq.status !== "active") 
    return NextResponse.json({ ok:false, error:`Sequence is ${seq.status}` }, { status:409 });

  // upsert enrollments
  const toIns = rows.map((r: any) => ({
    workspace_id: u.user.id,
    sequence_id: params.id,
    to_email: String(r.to).toLowerCase(),
    vars: r.vars ?? {},
    status: "active",
    current_position: 0,
    last_job_id: null,
    last_event: null,
    next_scheduled_at: new Date(Date.now() + (Number(r.startInSeconds || 0)) * 1000).toISOString()
  }));

  const { error } = await supabase
    .from("sequence_enrollments")
    .upsert(toIns, { onConflict: "sequence_id,to_email" });
    
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });

  return NextResponse.json({ ok:true, inserted: toIns.length });
}