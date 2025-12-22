import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser(); if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  // read sequence & workspace
  const { data: seq, error: sErr } = await supabase.from("sequences").select("id,workspace_id,name").eq("id", params.id).single();
  if (sErr || !seq || seq.workspace_id !== u.user.id) return NextResponse.json({ ok:false, error:"Not found" }, { status:404 });

  const [{ data: funnel }, { data: tto }] = await Promise.all([
    supabase.from("v_sequence_step_funnel").select("*").eq("workspace_id", u.user.id).eq("sequence_id", params.id).order("position"),
    supabase.from("v_sequence_step_time_to_open").select("*").eq("workspace_id", u.user.id).eq("sequence_id", params.id).order("position")
  ]);

  // totals from enrollments
  const { data: totals } = await supabase
    .from("sequence_enrollments")
    .select("status, count:id")
    .eq("sequence_id", params.id)
    .group("status");

  return NextResponse.json({ ok:true, funnel: funnel ?? [], timeToOpen: tto ?? [], totals: totals ?? [] });
}