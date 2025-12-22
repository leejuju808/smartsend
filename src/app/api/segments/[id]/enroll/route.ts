import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest, { params }: { params:{ id:string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", u.user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) return NextResponse.json({ ok:false, error:"No workspace found" }, { status:400 });

  const body = await req.json().catch(()=>({}));
  const sequenceId = body.sequenceId as string | undefined;
  if (!sequenceId) return NextResponse.json({ ok:false, error:"sequenceId required" }, { status:400 });

  const [{ data: seg }, { data: seq }] = await Promise.all([
    supabase.from("segments").select("workspace_id,definition").eq("id", params.id).single(),
    supabase.from("sequences").select("workspace_id,status").eq("id", sequenceId).single()
  ]);
  if (!seg || seg.workspace_id !== workspaceId) return NextResponse.json({ ok:false, error:"Segment not found" }, { status:404 });
  if (!seq || seq.workspace_id !== workspaceId || seq.status !== "active") return NextResponse.json({ ok:false, error:"Sequence invalid" }, { status:409 });

  // For now, get all contacts in the workspace - in a real implementation, you'd filter based on segment definition
  // TODO: Implement proper segment filtering using buildContactsFilter
  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, email, attrs")
    .eq("workspace_id", workspaceId)
    .limit(5000);
  
  if (error) return NextResponse.json({ ok:false, error:String(error) }, { status:500 });

  if (!contacts?.length) return NextResponse.json({ ok:true, inserted:0 });

  const rows = contacts.map((c:any) => ({
    workspace_id: workspaceId,
    sequence_id: sequenceId,
    contact_id: c.id,
    email: String(c.email).toLowerCase(),
    status: "active",
    current_step: 0,
    next_send_at: new Date(Date.now() + 1000).toISOString()
  }));

  // upsert by (sequence_id,contact_id)
  const CHUNK = 500;
  let inserted = 0;
  for (let i=0;i<rows.length;i+=CHUNK) {
    const slice = rows.slice(i,i+CHUNK);
    const { error: insErr } = await supabase.from("sequence_subscribers").upsert(slice, { onConflict: "sequence_id,contact_id" });
    if (insErr) return NextResponse.json({ ok:false, error:insErr.message, index:i }, { status:500 });
    inserted += slice.length;
  }

  return NextResponse.json({ ok:true, inserted });
}