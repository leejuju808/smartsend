import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enqueueApprovedDraft } from "@/lib/queue";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { draftIds } = await req.json();
    if (!Array.isArray(draftIds) || draftIds.length === 0)
      return NextResponse.json({ error: "No draftIds" }, { status: 400 });

    // Approve all
    const { data: updated, error: uErr } = await supabase
      .from("email_drafts")
      .update({ status: "approved" })
      .in("id", draftIds)
      .select("id");
    if (uErr) throw uErr;

    // Enqueue (sequential to respect unique index + rate limit)
    let ok = 0, fails: string[] = [];
    for (const d of updated ?? []) {
      try { await enqueueApprovedDraft(d.id); ok++; } catch (e:any) { fails.push(d.id); }
    }

    return NextResponse.json({ ok, failed: fails.length, failedIds: fails });
  } catch (e:any) {
    return NextResponse.json({ error: e.message ?? "error" }, { status: 500 });
  }
}