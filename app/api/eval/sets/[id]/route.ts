import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/eval/sets/[id] - Get eval set details
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: set, error: setError } = await sb
    .from("eval_sets")
    .select("*")
    .eq("id", params.id)
    .single();

  if (setError || !set) {
    return NextResponse.json({ error: "Eval set not found" }, { status: 404 });
  }

  const { count: itemCount } = await sb
    .from("eval_items")
    .select("*", { count: "exact", head: true })
    .eq("eval_set_id", params.id);

  const { count: runCount } = await sb
    .from("eval_runs")
    .select("*", { count: "exact", head: true })
    .eq("eval_set_id", params.id);

  return NextResponse.json({
    ...set,
    item_count: itemCount ?? 0,
    run_count: runCount ?? 0,
  });
}

// PATCH /api/eval/sets/[id] - Update eval set
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, notes, is_active } = body;

  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (notes !== undefined) updates.notes = notes;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data: set, error } = await sb
    .from("eval_sets")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ set });
}















