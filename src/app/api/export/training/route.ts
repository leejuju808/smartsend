import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

function rowToJSONL(row: any) {
  const out = {
    id: row.example_id,
    input: row.body_scrubbed,
    ai_intent: row.ai_intent,
    ai_confidence: row.ai_confidence,
    human_intent: row.human_intent,
    ai_matches_human: row.ai_matches_human,
    meta: {
      message_at: row.message_at,
      thread_id: row.thread_id,
      campaign_id: row.campaign_id,
    },
  };
  return JSON.stringify(out);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "jsonl").toLowerCase();
  const start = url.searchParams.get("start") ?? undefined;
  const end = url.searchParams.get("end") ?? undefined;
  const requireHuman = (url.searchParams.get("requireHuman") ?? "true") === "true";
  const campaignId = url.searchParams.get("campaignId") ?? null;

  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc("export_training_examples", {
    p_start: start ?? null,
    p_end: end ?? null,
    p_require_human: requireHuman,
    p_campaign_id: campaignId,
    p_limit: 5000,
    p_cursor: null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (format === "csv") {
    const header = [
      "id",
      "message_at",
      "ai_intent",
      "ai_confidence",
      "human_intent",
      "ai_matches_human",
      "thread_id",
      "campaign_id",
      "body_scrubbed",
    ];

    const lines = [header.join(",")].concat(
      (data ?? []).map((r: any) =>
        [
          r.example_id,
          r.message_at,
          r.ai_intent,
          r.ai_confidence ?? "",
          r.human_intent ?? "",
          r.ai_matches_human ? "1" : "0",
          r.thread_id,
          r.campaign_id,
          JSON.stringify(r.body_scrubbed).replace(/^"|"$/g, ""),
        ].join(","),
      ),
    );

    const csv = lines.join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="smartsend_training_${Date.now()}.csv"`,
      },
    });
  }

  const jsonl = (data ?? []).map(rowToJSONL).join("\n");
  return new NextResponse(jsonl, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Disposition": `attachment; filename="smartsend_training_${Date.now()}.jsonl"`,
    },
  });
}





