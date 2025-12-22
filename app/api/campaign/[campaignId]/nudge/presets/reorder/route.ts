import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type ReorderItem = { id: string; sort_order: number };

export async function PATCH(req: Request, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));
  const items: ReorderItem[] = Array.isArray(body?.items) ? body.items : [];

  if (!items.length) {
    return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  }

  const updates = items.map((item) => ({
    id: item.id,
    sort_order: item.sort_order,
  }));

  const { error } = await supabase.from("nudge_presets").upsert(updates, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}


