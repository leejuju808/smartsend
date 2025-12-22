import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || "";
    const limit = Number(url.searchParams.get("limit") || 25);
    const offset = Number(url.searchParams.get("offset") || 0);

    // Basic search by email/name on leads and join to view via two-step
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id,email,name")
      .ilike("email", q ? `%${q}%` : "%")
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const ids = (leads ?? []).map((l) => l.id);
    if (!ids.length) {
      return NextResponse.json({ rows: [], total: 0 });
    }

    const { data: rows } = await supabaseAdmin
      .from("lead_activity")
      .select("*")
      .in("lead_id", ids);

    // attach identity
    const map = new Map(rows?.map((r) => [r.lead_id, r]) || []);
    const enriched = (leads ?? []).map((l) => ({
      lead_id: l.id,
      email: l.email,
      name: l.name,
      ...map.get(l.id),
    }));

    return NextResponse.json({ rows: enriched, total: enriched.length });
  } catch (error: any) {
    console.error("Error fetching lead activity:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch lead activity" },
      { status: 500 }
    );
  }
}

