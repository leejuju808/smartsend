import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { setAccountContext } from "@/app/api/_utils/account";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(req: NextRequest) {
  const gate = await requireRole(["owner", "admin", "member"]);
  if (!gate.allowed) return gate.res;

  const supabase = createRouteHandlerClient({ cookies });
  const accountId = await setAccountContext(supabase);

  if (!accountId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { primaryId, secondaryId } = body;

  if (!primaryId || !secondaryId) {
    return NextResponse.json(
      { error: "primaryId and secondaryId are required" },
      { status: 400 }
    );
  }

  // Merge tags
  const { error: tagsError } = await supabase.rpc("merge_lead_tags", {
    primary_id: primaryId,
    secondary_id: secondaryId,
  });

  if (tagsError) {
    console.error("Error merging tags:", tagsError);
  }

  // Merge notes
  const { error: notesError } = await supabase.rpc("merge_lead_notes", {
    primary_id: primaryId,
    secondary_id: secondaryId,
  });

  if (notesError) {
    console.error("Error merging notes:", notesError);
  }

  // Move activity timeline
  await supabase
    .from("email_events")
    .update({ lead_id: primaryId })
    .eq("lead_id", secondaryId);

  await supabase
    .from("email_replies")
    .update({ lead_id: primaryId })
    .eq("lead_id", secondaryId);

  // Record merge history
  const { data: currentLead } = await supabase
    .from("leads")
    .select("merge_history")
    .eq("id", primaryId)
    .single();

  const mergeHistoryEntry = {
    merged: secondaryId,
    at: new Date().toISOString(),
  };

  const updatedHistory = [
    ...(currentLead?.merge_history || []),
    mergeHistoryEntry,
  ];

  await supabase
    .from("leads")
    .update({ merge_history: updatedHistory })
    .eq("id", primaryId);

  // Delete secondary lead
  const { error: deleteError } = await supabase
    .from("leads")
    .delete()
    .eq("id", secondaryId);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 500 }
    );
  }

  // Update queue entry
  await supabase
    .from("merge_queue")
    .update({ status: "resolved" })
    .or(`lead_a.eq.${secondaryId},lead_b.eq.${secondaryId}`)
    .eq("status", "pending");

  return NextResponse.json({ ok: true });
}












