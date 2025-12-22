import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

function sanitizeRow(row: Record<string, any>, targetWorkspaceId: string) {
  const copy: Record<string, any> = { ...row };
  delete copy.id;
  delete copy.created_at;
  delete copy.updated_at;
  copy.workspace_id = targetWorkspaceId;
  copy.updated_at = new Date().toISOString();
  return copy;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const source_workspace_id =
      typeof body?.source_workspace_id === "string" ? body.source_workspace_id : null;
    const target_workspace_id =
      typeof body?.target_workspace_id === "string" ? body.target_workspace_id : null;

    if (!source_workspace_id || !target_workspace_id) {
      return NextResponse.json(
        { error: "source_workspace_id and target_workspace_id are required" },
        { status: 400 }
      );
    }

    const tables = [
      "contractor_profile",
      "contractor_services",
      "contractor_territory",
      "contractor_schedule_rules",
      "contractor_pricing",
      "contractor_material_preferences",
      "contractor_insurance_preferences",
      "contractor_quote_preferences",
      "contractor_regional_data",
    ] as const;

    const results: Record<string, { copied: number; skipped: boolean; error?: string }> = {};

    for (const table of tables) {
      // Load all rows for source workspace (some tables may be multi-row).
      const { data: rows, error: readErr } = await supabaseAdmin
        .from(table)
        .select("*")
        .eq("workspace_id", source_workspace_id);

      if (readErr) {
        results[table] = { copied: 0, skipped: true, error: readErr.message };
        continue;
      }

      // Replace target rows to make cloning deterministic.
      const { error: delErr } = await supabaseAdmin
        .from(table)
        .delete()
        .eq("workspace_id", target_workspace_id);

      if (delErr) {
        results[table] = { copied: 0, skipped: true, error: delErr.message };
        continue;
      }

      if (!rows || rows.length === 0) {
        results[table] = { copied: 0, skipped: false };
        continue;
      }

      const payload = rows.map((r: any) => sanitizeRow(r, target_workspace_id));

      const { error: insErr } = await supabaseAdmin.from(table).insert(payload as any);
      if (insErr) {
        results[table] = { copied: 0, skipped: true, error: insErr.message };
        continue;
      }

      results[table] = { copied: payload.length, skipped: false };
    }

    return NextResponse.json({
      ok: true,
      source_workspace_id,
      target_workspace_id,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}








