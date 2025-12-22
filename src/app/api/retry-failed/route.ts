import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const { leadIds } = await req.json();
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "leadIds required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("retry_failed_leads", {
      p_lead_ids: leadIds,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = (data ?? []).map((r: any) => ({
      lead_id: r.lead_id,
      queued: r.queued,
    }));

    return NextResponse.json({ result });
  } catch (e: any) {
    console.error("Error in retry-failed:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
