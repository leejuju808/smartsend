import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const body = await req.json();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const payload = {
    scope: body.scope ?? "replies-cls",
    name: body.name,
    priority: body.priority ?? 100,
    kind: body.kind,
    pattern: body.pattern,
    force_label: body.force_label,
    notes: body.notes,
    enabled: body.enabled ?? true,
  };

  const required = ["name", "kind", "pattern", "force_label"];
  for (const key of required) {
    if (!payload[key as keyof typeof payload]) {
      return NextResponse.json({ ok: false, error: `${key} is required` }, { status: 400 });
    }
  }

  const { error } = await supabase.from("ai_post_rules").insert(payload);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
















