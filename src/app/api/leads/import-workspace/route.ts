import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type LeadRow = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
};

function normalizeEmail(e: string) {
  return e.trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspace_id, rows } = body as { workspace_id: string; rows: LeadRow[] };

    if (!workspace_id || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing workspace_id or rows" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
    );

    // Validate + sanitize
    const clean: LeadRow[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      if (!r?.email) continue;
      const email = normalizeEmail(r.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      clean.push({
        email,
        first_name: r.first_name?.trim() || null,
        last_name: r.last_name?.trim() || null,
        company: r.company?.trim() || null,
      });
    }

    if (clean.length === 0) {
      return NextResponse.json({ ok: false, error: "No valid rows to import" }, { status: 400 });
    }

    // Block 417: Enforce lead limits
    const { enforceLimits } = await import("@/lib/enforce");
    const limitCheck = await enforceLimits(workspace_id, "leads_count");
    
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "leads_limit",
          message: limitCheck.message || "You've reached your lead limit. Upgrade to increase limits.",
          current: limitCheck.current,
          limit: limitCheck.limit,
        },
        { status: 403 }
      );
    }

    // Check if adding new leads would exceed limit
    const currentLeads = limitCheck.current || 0;
    const limit = limitCheck.limit || 5000;
    if (currentLeads + clean.length > limit) {
      return NextResponse.json(
        {
          ok: false,
          error: "leads_limit",
          message: `Adding ${clean.length} leads would exceed your limit of ${limit.toLocaleString()}. You currently have ${currentLeads.toLocaleString()} leads.`,
          current: currentLeads,
          limit: limit,
        },
        { status: 403 }
      );
    }

    // Upsert in batches
    const BATCH = 500;
    let inserted = 0, updated = 0, errors = 0;

    for (let i = 0; i < clean.length; i += BATCH) {
      const slice = clean.slice(i, i + BATCH).map((r) => ({ ...r, workspace_id }));
      const { data, error } = await supabase
        .from("leads")
        .upsert(slice, { onConflict: "workspace_id,email" })
        .select("id, created_at");

      if (error) {
        errors += slice.length;
      } else {
        // Heuristic: if your table has "created_at" default now(), you can't directly know ins/up.
        // Optional: add a trigger to track "is_new". For now, treat all as success.
        inserted += data?.length ?? 0;
      }
    }

    return NextResponse.json({
      ok: true,
      total_received: rows.length,
      valid: clean.length,
      inserted_or_upserted: inserted,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
