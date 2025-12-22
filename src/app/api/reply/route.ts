import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const Schema = z.object({
  thread_id: z.string().uuid(),
  to: z.string().email(),
  body: z.string().min(1),
  subject: z.string().default("Re: (no subject)"),
});

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const json = await req.json();
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { thread_id, to, body, subject } = parsed.data;

  // 1) Insert reply (RLS enforces ownership)
  const { data: reply, error: insertErr } = await supabase
    .from("replies")
    .insert({ thread_id, to_email: to, body, user_id: user.id })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

  // 2) Call Edge Function to actually send
  const fnRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: user.id,
      to,
      subject,
      body,
    }),
  });

  if (!fnRes.ok) {
    const err = await fnRes.text();
    // soft-fail: we keep the reply stored + status updated; surface error to UI
    return NextResponse.json({ ok: false, reply, send_error: err }, { status: 502 });
  }

  const sendResult = await fnRes.json();

  // 3) Return updated thread meta (status now 'replied' via trigger)
  const { data: thread, error: threadErr } = await supabase
    .from("emails")
    .select("*")
    .eq("id", thread_id)
    .single();

  return NextResponse.json({ ok: true, reply, thread, sendResult }, { status: 200 });
}
