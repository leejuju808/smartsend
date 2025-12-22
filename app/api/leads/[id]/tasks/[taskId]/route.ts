import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; taskId: string }>;
  }
) {
  const supabase = createClient();
  const { id, taskId } = await params;
  const leadId = id;

  const body = await req.json();
  const updates: Record<string, any> = {};

  if (body.status !== undefined) updates.status = body.status;
  if (body.title !== undefined) updates.title = body.title;
  if (body.due_at !== undefined) updates.due_at = body.due_at;

  const { data: task, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .eq("lead_id", leadId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ task });
}










