import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const JSON_HEADERS = { "content-type": "application/json" };

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("ooo_patterns")
    .select("id, created_at, pattern, locale, priority, active, note")
    .order("priority", { ascending: true });

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

  const pattern = typeof body?.pattern === "string" ? body.pattern : "";
  if (!pattern) {
    return NextResponse.json(
      { error: "pattern required" },
      { status: 400, headers: JSON_HEADERS }
    );
  }

  const priority =
    typeof body?.priority === "number" && Number.isFinite(body.priority)
      ? body.priority
      : 10;

  const { data, error } = await supabase
    .from("ooo_patterns")
    .insert({
      pattern,
      priority,
      locale: typeof body?.locale === "string" && body.locale ? body.locale : "en",
      note: typeof body?.note === "string" ? body.note : null,
      active: body?.active !== false,
    })
    .select("id, created_at, pattern, locale, priority, active, note")
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
  if (typeof patch.pattern === "string") updates.pattern = patch.pattern;
  if (typeof patch.locale === "string" || patch.locale === null) updates.locale = patch.locale;
  if (typeof patch.note === "string" || patch.note === null) updates.note = patch.note;
  if (typeof patch.active === "boolean") updates.active = patch.active;
  if (typeof patch.priority === "number" && Number.isFinite(patch.priority)) {
    updates.priority = patch.priority;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "no valid fields provided" },
      { status: 400, headers: JSON_HEADERS }
    );
  }

  const { data, error } = await supabase
    .from("ooo_patterns")
    .update(updates)
    .eq("id", id)
    .select("id, created_at, pattern, locale, priority, active, note")
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

  const { error } = await supabase.from("ooo_patterns").delete().eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: JSON_HEADERS }
    );
  }

  return NextResponse.json({ ok: true }, { headers: JSON_HEADERS });
}



