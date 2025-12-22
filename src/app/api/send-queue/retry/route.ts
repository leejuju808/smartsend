import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function POST(req: Request) {
  try {
    const { ids }: { ids: string[] } = await req.json();
    if (!ids || ids.length === 0) {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 });
    }

    // Optional: write logs first
    await supabaseAdmin.rpc("log_retries_from_queue", { p_ids: ids });

    // Retry eligible jobs
    const { data, error } = await supabaseAdmin.rpc("retry_failed_jobs", { p_ids: ids });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = Array.isArray(data) ? data : [];
    const requeued = result.filter((d: any) => d.message === "requeued").length;
    const skipped = result.length - requeued;

    return NextResponse.json({ requeued, skipped, details: result }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Retry failed" }, { status: 500 });
  }
}


