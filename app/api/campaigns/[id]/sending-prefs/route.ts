import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type PatchBody = {
  ooo_hold_days?: unknown;
  honor_snooze?: unknown;
};

const DEFAULT_HOLD_DAYS = 14;
const DEFAULT_HONOR_SNOOZE = true;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from("campaign_sending_prefs")
    .select("campaign_id, ooo_hold_days, honor_snooze")
    .eq("campaign_id", params.id)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json(
      { error: error.message ?? "Failed to load sending prefs" },
      { status: error.code === "42501" ? 403 : 500 }
    );
  }

  return NextResponse.json({
    item: {
      campaign_id: params.id,
      ooo_hold_days: data?.ooo_hold_days ?? DEFAULT_HOLD_DAYS,
      honor_snooze: data?.honor_snooze ?? DEFAULT_HONOR_SNOOZE,
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = { campaign_id: params.id };

  if (body.ooo_hold_days !== undefined) {
    const parsed = Number(body.ooo_hold_days);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 365) {
      return NextResponse.json(
        { error: "Hold days must be a number between 0 and 365." },
        { status: 400 }
      );
    }
    updates.ooo_hold_days = Math.trunc(parsed);
  }

  if (body.honor_snooze !== undefined) {
    if (typeof body.honor_snooze !== "boolean") {
      return NextResponse.json(
        { error: "Honor snooze must be a boolean." },
        { status: 400 }
      );
    }
    updates.honor_snooze = body.honor_snooze;
  }

  if (!("ooo_hold_days" in updates) && !("honor_snooze" in updates)) {
    return NextResponse.json(
      { error: "No valid fields provided." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("campaign_sending_prefs")
    .upsert(updates, { onConflict: "campaign_id" })
    .select("campaign_id, ooo_hold_days, honor_snooze")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to update sending prefs." },
      { status: error.code === "42501" ? 403 : 500 }
    );
  }

  return NextResponse.json({ item: data });
}

