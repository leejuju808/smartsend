// File: app/api/inbox/resolve-user/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sbAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // admin since we need to backfill
    { auth: { persistSession: false } }
  );

/**
 * Finds messages where user_id is NULL and sets it by matching messages.to_email
 * against inbound_routes.to_email.
 *
 * POST body (optional):
 * { "limit": 200 }
 */
export async function POST(req: Request) {
  try {
    const { limit = 200 } = (await req.json().catch(() => ({}))) as {
      limit?: number;
    };

    const sb = sbAdmin();

    // 1) Fetch candidate messages
    const { data: msgs, error: mErr } = await sb
      .from("messages")
      .select("id, to_email")
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(1, limit), 1000));

    if (mErr) throw new Error(`Fetch messages failed: ${mErr.message}`);
    if (!msgs || msgs.length === 0) {
      return NextResponse.json({ updated: 0, detail: "No messages to resolve." });
    }

    // 2) Get routes for all unique to_email
    const emails = Array.from(new Set(msgs.map((m) => (m.to_email || "").toLowerCase())));
    const { data: routes, error: rErr } = await sb
      .from("inbound_routes")
      .select("user_id, to_email");
    if (rErr) throw new Error(`Fetch routes failed: ${rErr.message}`);

    const routeMap = new Map<string, string>();
    (routes || []).forEach((r) => {
      if (r.to_email) routeMap.set(String(r.to_email).toLowerCase(), r.user_id);
    });

    // 3) Update messages in batches
    let updated = 0;
    for (const m of msgs) {
      const key = (m.to_email || "").toLowerCase();
      const userId = routeMap.get(key);
      if (!userId) continue;
      const { error: uErr } = await sb
        .from("messages")
        .update({ user_id: userId })
        .eq("id", m.id);
      if (!uErr) updated += 1;
    }

    return NextResponse.json({ updated, scanned: msgs.length });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
