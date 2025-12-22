import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/server/supabase";

type TrainingRow = {
  top_label: string | null;
  top_conf: number | null;
  label: string | null;
  labeled_at: string | null;
};

const BORDER_LOW = 0.45;
const BORDER_HIGH = 0.6;
const RANGE_DAYS = 14;

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - RANGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("v_reply_labels_training")
    .select("top_label, top_conf, label, labeled_at")
    .eq("owner_id", user.id)
    .gte("labeled_at", since);

  if (error) {
    console.error("label-review metrics query failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: TrainingRow[] = (data ?? []).map((row: any) => ({
    top_label: typeof row.top_label === "string" ? row.top_label : null,
    top_conf: typeof row.top_conf === "number" ? row.top_conf : typeof row.top_conf === "string" ? Number(row.top_conf) : null,
    label: typeof row.label === "string" ? row.label : null,
    labeled_at: row.labeled_at ?? null,
  }));

  const border = rows.filter(
    (row) =>
      row.top_conf !== null &&
      row.top_conf >= BORDER_LOW &&
      row.top_conf <= BORDER_HIGH &&
      row.top_label &&
      row.label,
  );
  const borderCorrect = border.filter((row) => row.top_label === row.label).length;

  const meeting = rows.filter((row) => row.top_label === "meeting_intent");
  const meetingCorrect = meeting.filter((row) => row.label === "meeting_intent").length;

  const oooGold = rows.filter((row) => row.label === "out_of_office");
  const oooCorrect = oooGold.filter((row) => row.top_label === "out_of_office").length;

  const toPercent = (value: number, total: number) =>
    total > 0 ? Math.round((value / total) * 1000) / 10 : null;

  return NextResponse.json({
    metrics: {
      borderAccuracy: {
        value: toPercent(borderCorrect, border.length),
        total: border.length,
      },
      meetingPrecision: {
        value: toPercent(meetingCorrect, meeting.length),
        total: meeting.length,
      },
      oooRecall: {
        value: toPercent(oooCorrect, oooGold.length),
        total: oooGold.length,
      },
    },
  });
}
















