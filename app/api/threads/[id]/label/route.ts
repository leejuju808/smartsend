import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ReplyLabel = "positive" | "neutral" | "oos" | "bounce" | "ooo" | "meeting_intent";

type LabelBody = {
  label: ReplyLabel;
  note?: string | null;
};

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from("threads")
      .select("last_inbound_label")
      .eq("id", params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ label: data?.last_inbound_label ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json()) as Partial<LabelBody>;
    if (!body?.label) {
      return NextResponse.json({ error: "Missing label" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: existing, error: fetchErr } = await supabase
      .from("threads")
      .select("last_inbound_label")
      .eq("id", params.id)
      .single();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 400 });
    }

    const { error: threadUpdateErr } = await supabase
      .from("threads")
      .update({ last_inbound_label: body.label })
      .eq("id", params.id);

    if (threadUpdateErr) {
      return NextResponse.json({ error: threadUpdateErr.message }, { status: 400 });
    }

    const { data: latestMessage } = await supabase
      .from("messages")
      .select("id")
      .eq("thread_id", params.id)
      .eq("direction", "inbound")
      .order("received_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestMessage?.id) {
      await supabase
        .from("messages")
        .update({
          label: body.label,
          label_confidence: null,
          clf_source: "manual",
        })
        .eq("id", latestMessage.id);
    }

    if (body.note || existing?.last_inbound_label !== body.label) {
      await supabase
        .from("label_overrides")
        .insert({
          thread_id: params.id,
          old_label: existing?.last_inbound_label ?? null,
          new_label: body.label,
          note: body.note ?? null,
        })
        .catch(() => void 0);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

