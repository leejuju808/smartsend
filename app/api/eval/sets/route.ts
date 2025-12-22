import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/eval/sets - List all eval sets
export async function GET(req: Request) {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const task = searchParams.get("task");
  const isActive = searchParams.get("is_active");

  let query = sb.from("eval_sets").select("id, name, task, notes, is_active, created_at").order("created_at", { ascending: false });

  if (task) {
    query = query.eq("task", task);
  }
  if (isActive !== null) {
    query = query.eq("is_active", isActive === "true");
  }

  const { data: sets, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Get item counts for each set
  const setsWithCounts = await Promise.all(
    (sets || []).map(async (set) => {
      const { count } = await sb
        .from("eval_items")
        .select("*", { count: "exact", head: true })
        .eq("eval_set_id", set.id);
      return { ...set, item_count: count ?? 0 };
    })
  );

  return NextResponse.json({ sets: setsWithCounts });
}

// POST /api/eval/sets - Create a new eval set
export async function POST(req: Request) {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, task, notes, is_active } = body;

  if (!name || !task) {
    return NextResponse.json({ error: "name and task are required" }, { status: 400 });
  }

  const { data: set, error } = await sb
    .from("eval_sets")
    .insert({
      name,
      task,
      notes: notes || null,
      is_active: is_active !== undefined ? is_active : true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ set });
}

