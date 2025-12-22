import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function POST(req: Request) {
  const { id, status, notes, due_at } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: any = { updated_at: new Date().toISOString() };
  if (status) patch.status = status;
  if (notes !== undefined) patch.notes = notes;
  if (due_at) patch.due_at = due_at;

  const { error } = await sb().from("follow_up_tasks").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}


