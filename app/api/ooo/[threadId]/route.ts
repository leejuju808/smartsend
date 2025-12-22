import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { threadId: string } },
) {
  const s = createClient();
  const { error } = await s.from("ooo_schedules")
    .delete()
    .eq("thread_id", params.threadId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}



