import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser(); 
  if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
  
  const [{ data: seq }, { data: steps }] = await Promise.all([
    supabase
      .from("sequences")
      .select("id,workspace_id,status,name,campaign_id")
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("sequence_steps")
      .select("*")
      .eq("sequence_id", params.id)
      .order("position")
  ]);
  
  if (!seq || seq.workspace_id !== u.user.id) 
    return NextResponse.json({ ok:false, error:"Not found" }, { status:404 });
    
  return NextResponse.json({ ok:true, sequence: seq, steps: steps || [] });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser(); 
  if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
  
  const body = await req.json().catch(() => ({}));
  const steps = Array.isArray(body.steps) ? body.steps : [];
  
  // Get campaign_id for version logging
  const { data: seqForVersion } = await supabase
    .from("sequences")
    .select("campaign_id")
    .eq("id", params.id)
    .maybeSingle();
  
  // clear & insert
  await supabase.from("sequence_steps").delete().eq("sequence_id", params.id);
  
  if (steps.length) {
    const rows = steps.map((s: any, i: number) => ({
      sequence_id: params.id,
      position: s.position ?? (i + 1),
      template_id: s.templateId ?? null,
      subject_override: s.subject ?? null,
      html_override: s.html ?? null,
      wait_seconds: Math.max(0, Number(s.waitSeconds ?? 0)),
      advance_rule: s.advanceRule ?? "always"
    }));
    
    const { error } = await supabase.from("sequence_steps").insert(rows);
    if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  }
  
  // Log version snapshot
  const { logSequenceVersion } = await import("@/lib/sequences/version-logger");
  await logSequenceVersion(params.id, seqForVersion?.campaign_id || null, u.user.id, "update_steps");
  
  return NextResponse.json({ ok:true });
}