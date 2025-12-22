// app/api/inbox/[id]/handled/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const messageId = params.id;

  const { error } = await supabase
    .from("email_messages")
    .update({ handled: true })
    .eq("id", messageId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}



























































