// app/api/leads/batch/tags/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(req: NextRequest) {
  const gate = await requireRole(["owner", "admin", "member"]);
  if (!gate.allowed) return gate.res;

  const supabase = createRouteHandlerClient({ cookies });

  const { ids, tag } = await req.json();

  if (!Array.isArray(ids) || !tag) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Postgres array append
  await supabase.rpc("append_tag_to_leads", {
    lead_ids: ids,
    new_tag: tag,
  });

  // Log timeline events for each lead
  for (const leadId of ids) {
    await supabase.from("lead_timeline_events").insert({
      lead_id: leadId,
      event_type: "tag_added",
      metadata: { tag }
    }).catch((err) => {
      console.error("Failed to log timeline event:", err);
    });
  }

  return NextResponse.json({ ok: true });
}

