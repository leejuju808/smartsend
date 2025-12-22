import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/eval/items - Add item to eval set (from inbox)
export async function POST(req: Request) {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { eval_set_id, text, gold_label, source, aux } = body;

  if (!eval_set_id || !text || !gold_label) {
    return NextResponse.json(
      { error: "eval_set_id, text, and gold_label are required" },
      { status: 400 }
    );
  }

  // Verify eval set exists
  const { data: evalSet } = await sb
    .from("eval_sets")
    .select("id, task")
    .eq("id", eval_set_id)
    .single();

  if (!evalSet) {
    return NextResponse.json({ error: "Eval set not found" }, { status: 404 });
  }

  const { data: item, error } = await sb
    .from("eval_items")
    .insert({
      eval_set_id,
      text,
      gold_label,
      source: source || "reply",
      aux: aux || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ item });
}















