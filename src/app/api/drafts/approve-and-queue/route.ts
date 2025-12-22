import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enqueueApprovedDraft } from "@/lib/queue";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { draftId } = await req.json();
    if (!draftId) return NextResponse.json({ error: "Missing draftId" }, { status: 400 });

    // 1) Mark approved
    const { data: updated, error: uErr } = await supabase
      .from("email_drafts")
      .update({ status: "approved" })
      .eq("id", draftId)
      .select("id")
      .single();
    if (uErr || !updated) throw new Error("Unable to approve draft");

    // 2) Enqueue immediately
    await enqueueApprovedDraft(draftId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "error" }, { status: 500 });
  }
}