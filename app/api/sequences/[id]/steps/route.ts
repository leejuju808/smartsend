import { NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser(); 
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createSupabaseServer();

  const { subject, body, delay_hours, step_order } = await req.json();
  if (!subject || !body) return NextResponse.json({ error: "subject & body required" }, { status: 400 });

  // Get campaign_id from sequence for permission check
  const { data: seq } = await supabase.from("sequences").select("campaign_id").eq("id", params.id).maybeSingle();
  if (!seq) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!seq.campaign_id) return NextResponse.json({ error: "Sequence not linked to campaign" }, { status: 400 });

  // enforce collaborator permissions
  const { requireEditor } = await import("@/lib/permissions/campaign");
  const check = await requireEditor(seq.campaign_id);
  if (!check.allowed) return check.response;

  // If no order provided, append to end
  let order = step_order;
  if (order == null) {
    const { data: maxOrder } = await supabase
      .from("sequence_steps")
      .select("step_order")
      .eq("sequence_id", params.id)
      .order("step_order", { ascending: false })
      .limit(1).maybeSingle();
    order = (maxOrder?.step_order ?? 0) + 1;
  }

  const { data, error } = await supabase.from("sequence_steps").insert({
    sequence_id: params.id,
    subject, body,
    delay_hours: delay_hours ?? 0,
    step_order: order
  }).select("id,step_order,delay_hours,subject,body").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Log version snapshot
  const { logSequenceVersion } = await import("@/lib/sequences/version-logger");
  await logSequenceVersion(params.id, seq.campaign_id, user.id, "add_step");
  
  return NextResponse.json({ step: data });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  // bulk reorder/update: [{id, step_order, delay_hours, subject, body}]
  const user = await getUser(); 
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createSupabaseServer();
  const updates = await req.json();

  // Get campaign_id from sequence for permission check
  const { data: seq } = await supabase.from("sequences").select("campaign_id").eq("id", params.id).maybeSingle();
  if (!seq) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!seq.campaign_id) return NextResponse.json({ error: "Sequence not linked to campaign" }, { status: 400 });

  // enforce collaborator permissions
  const { requireEditor } = await import("@/lib/permissions/campaign");
  const check = await requireEditor(seq.campaign_id);
  if (!check.allowed) return check.response;

  // upsert steps
  const { error } = await supabase.from("sequence_steps").upsert(
    updates.map((u: any) => ({ ...u, sequence_id: params.id })), { onConflict: "id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Log version snapshot
  const { logSequenceVersion } = await import("@/lib/sequences/version-logger");
  await logSequenceVersion(params.id, seq.campaign_id, user.id, "update_steps");
  
  return NextResponse.json({ ok: true });
}