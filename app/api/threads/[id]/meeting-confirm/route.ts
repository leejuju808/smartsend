import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }

  const body = await req.json();
  const supa = createClient(supabaseUrl, supabaseKey);

  const { data: draft, error } = await supa
    .from("meeting_drafts")
    .select("*")
    .eq("thread_id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!draft) {
    return NextResponse.json({ ok: false, error: "no_draft" }, { status: 404 });
  }

  const win = draft.windows?.[body.windowIndex ?? 0];
  if (!win) {
    return NextResponse.json({ ok: false, error: "bad_window" }, { status: 422 });
  }

  // TODO: call calendar provider bridge to create the actual event
  // const event = await createCalendarEvent({
  //   start: win.start,
  //   end: win.end,
  //   title: body.title ?? draft.title,
  //   attendees: [...],
  // });

  await supa
    .from("meeting_drafts")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", draft.id);

  return NextResponse.json({ ok: true });
}

