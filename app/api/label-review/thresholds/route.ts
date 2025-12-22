import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const LABELS = [
  "positive",
  "neutral",
  "objection",
  "meeting_intent",
  "out_of_office",
  "unsubscribe",
  "bounce",
  "other",
] as const;

const DEFAULT_THRESHOLD = 0.55;

type ThresholdsPayload = Partial<Record<(typeof LABELS)[number], number>>;

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("classifier_thresholds")
    .select("label, threshold")
    .order("label");

  if (error) {
    console.error("classifier_thresholds GET failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const thresholds: Record<string, number> = {};
  for (const label of LABELS) {
    thresholds[label] = DEFAULT_THRESHOLD;
  }

  for (const row of data ?? []) {
    const label = row.label as (typeof LABELS)[number];
    if (LABELS.includes(label) && typeof row.threshold === "number") {
      thresholds[label] = Math.min(Math.max(row.threshold, 0), 1);
    }
  }

  return NextResponse.json({ thresholds });
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload: ThresholdsPayload = await req.json().catch(() => ({}));

  const rows = LABELS.map((label) => {
    const value = payload?.[label];
    const threshold = typeof value === "number" ? Math.min(Math.max(value, 0), 1) : DEFAULT_THRESHOLD;
    return { owner_id: user.id, label, threshold };
  });

  const { error } = await supabase
    .from("classifier_thresholds")
    .upsert(rows, { onConflict: "owner_id,label" });

  if (error) {
    console.error("classifier_thresholds POST failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
















