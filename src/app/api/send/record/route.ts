// File: app/api/send/record/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sbAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

type Body = {
  user_id: string;
  items: Array<{
    to_email: string;
    subject?: string;
    body_text?: string;
    provider?: string;
    provider_message_id?: string | null;
    thread_id?: string | null;
  }>;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.user_id || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "user_id and items[] required" }, { status: 400 });
    }

    const rows = body.items.map((i) => ({
      user_id: body.user_id,
      direction: "outbound",
      from_email: null,
      to_email: i.to_email.toLowerCase(),
      subject: i.subject ?? null,
      body_text: i.body_text ?? null,
      body_html: null,
      provider: i.provider ?? null,
      provider_message_id: i.provider_message_id ?? null,
      thread_id: i.thread_id ?? null,
    }));

    const sb = sbAdmin();
    const { error } = await sb.from("messages").insert(rows);
    if (error) throw error;

    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "server_error" }, { status: 500 });
  }
}
