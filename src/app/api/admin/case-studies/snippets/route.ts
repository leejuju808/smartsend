import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

function buildSnippet(cs: any): string {
  const title = String(cs?.title || "Case Study");
  const snapshot = cs?.snapshot_json?.snapshot || {};
  const city = snapshot?.city ? String(snapshot.city) : "";
  const state = snapshot?.state ? String(snapshot.state) : "";
  const location = [city, state].filter(Boolean).join(", ");
  const results = Array.isArray(cs?.snapshot_json?.results) ? cs.snapshot_json.results : [];
  const resultLines = results
    .slice(0, 4)
    .map((r: any) => `- ${String(r?.label || "Result")}: ${String(r?.value ?? "—")}`)
    .join("\n");

  return [
    "Proof (auto-generated):",
    title,
    location ? `Location: ${location}` : "",
    "",
    "Results:",
    resultLines || "- —",
    "",
    '“SmartSend paid for itself after the first job.”',
    "(Anonymous, standardized.)",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("case_studies")
      .select("id, title, snapshot_json")
      .eq("approved_for_use", true)
      .order("generated_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const snippets = (data || []).map((cs: any) => ({
      id: cs.id,
      title: cs.title,
      text: buildSnippet(cs),
    }));

    return NextResponse.json({ snippets });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}









