import { NextResponse } from "next/server";
import { isDemoModeServer } from "@/lib/demo-mode-server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const isDemo = await isDemoModeServer();
    if (!isDemo) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("case_studies")
      .select("id, title, generated_at, snapshot_json")
      .eq("approved_for_use", true)
      .order("generated_at", { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (data || []).map((cs: any) => ({
      id: cs.id,
      title: cs.title,
      generated_at: cs.generated_at,
      snapshot: cs.snapshot_json?.snapshot || {},
      problem: cs.snapshot_json?.problem || "",
      solution: cs.snapshot_json?.solution || [],
      results: cs.snapshot_json?.results || [],
      quote: cs.snapshot_json?.quote || {
        text: "“SmartSend paid for itself after the first job.”",
        attribution: "(Anonymous, standardized.)",
      },
    }));

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}









