import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const JSON_HEADERS = { "content-type": "application/json" };

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("label_actions")
    .select("id, created_at, campaign_id, label_key, action, params")
    .order("campaign_id", { ascending: true, nullsFirst: true })
    .order("label_key", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: JSON_HEADERS }
    );
  }

  return NextResponse.json(data ?? [], { headers: JSON_HEADERS });
}

export async function POST(req: Request) {
  const supabase = createServiceClient();
  const body = await req.json();

  const labelKey = typeof body?.label_key === "string" ? body.label_key : "";
  const action = typeof body?.action === "string" ? body.action : "";

  if (!labelKey || !action) {
    return NextResponse.json(
      { error: "label_key and action required" },
      { status: 400, headers: JSON_HEADERS }
    );
  }

  const { data, error } = await supabase
    .from("label_actions")
    .insert({
      label_key: labelKey,
      action,
      campaign_id: typeof body?.campaign_id === "string" && body.campaign_id ? body.campaign_id : null,
      params: typeof body?.params === "object" && body.params !== null ? body.params : null,
    })
    .select("id, created_at, campaign_id, label_key, action, params")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: JSON_HEADERS }
    );
  }

  return NextResponse.json(data, { status: 201, headers: JSON_HEADERS });
}

export async function PATCH(req: Request) {
  const supabase = createServiceClient();
  const body = await req.json();
  const id = typeof body?.id === "string" ? body.id : null;
  const patch = body?.patch ?? {};

  if (!id || typeof patch !== "object" || patch === null) {
    return NextResponse.json(
      { error: "id and patch required" },
      { status: 400, headers: JSON_HEADERS }
    );
  }

  const updates: Record<string, unknown> = {};

  if (typeof patch.label_key === "string") updates.label_key = patch.label_key;
  if (typeof patch.action === "string") updates.action = patch.action;

  if (typeof patch.campaign_id === "string") {
    updates.campaign_id = patch.campaign_id;
  } else if (patch.campaign_id === null) {
    updates.campaign_id = null;
  }

  if (typeof patch.params === "object") {
    updates.params = patch.params;
  } else if (patch.params === null) {
    updates.params = null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "no valid fields provided" },
      { status: 400, headers: JSON_HEADERS }
    );
  }

  const { data, error } = await supabase
    .from("label_actions")
    .update(updates)
    .eq("id", id)
    .select("id, created_at, campaign_id, label_key, action, params")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: JSON_HEADERS }
    );
  }

  return NextResponse.json(data, { headers: JSON_HEADERS });
}

export async function DELETE(req: Request) {
  const supabase = createServiceClient();
  const body = await req.json();
  const id = typeof body?.id === "string" ? body.id : null;

  if (!id) {
    return NextResponse.json(
      { error: "id required" },
      { status: 400, headers: JSON_HEADERS }
    );
  }

  const { error } = await supabase.from("label_actions").delete().eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: JSON_HEADERS }
    );
  }

  return NextResponse.json({ ok: true }, { headers: JSON_HEADERS });
}



