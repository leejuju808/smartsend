import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { userId, returnAt, note }: { userId?: string; returnAt?: string; note?: string } = await req.json();

  if (!userId || !returnAt) {
    return NextResponse.json({ error: "userId and returnAt are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const payload = {
    user_id: userId,
    return_at: returnAt,
    note: note ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("user_ooo").upsert(payload, { onConflict: "user_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


