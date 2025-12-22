import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { parse } from "csv-parse/sync";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const teamId = String(form.get("team_id") || "");

    if (!file || !teamId) {
      return NextResponse.json(
        { error: "Missing file or team_id" },
        { status: 400 }
      );
    }

    // Get authenticated user
    const supabase = createRouteHandlerClient({ cookies: () => cookies() });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    // Verify user is member of the team
    const { data: membership } = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this team" },
        { status: 403 }
      );
    }

    // Parse CSV file
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    
    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV must have at least a header and one row" }, { status: 400 });
    }

    // Parse header and sample rows
    const header = lines[0].split(",").map((h) => h.trim());
    const totalRows = lines.length - 1;

    // Parse first 20 rows as sample
    const sample = [];
    for (let i = 1; i < Math.min(21, lines.length); i++) {
      const cols = lines[i].split(",");
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => {
        obj[h] = (cols[idx] ?? "").trim();
      });
      sample.push({ row_number: i, raw: obj });
    }

    // Create import job record
    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .insert({
        team_id: teamId,
        user_id: user.id,
        filename: file.name,
        total_rows: totalRows,
        status: "Mapping",
      })
      .select("*")
      .single();

    if (jobError || !job) {
      console.error("Failed to create import job:", jobError);
      return NextResponse.json(
        { error: "Failed to create import job" },
        { status: 500 }
      );
    }

    // Store sample rows for preview
    const rowsToInsert = sample.map((r) => ({
      job_id: job.id,
      row_number: r.row_number,
      raw: r.raw,
    }));

    const { error: rowsError } = await supabase
      .from("import_job_rows")
      .insert(rowsToInsert);

    if (rowsError) {
      console.error("Failed to insert sample rows:", rowsError);
      // Don't fail the whole request, just log
    }

    return NextResponse.json({
      job_id: job.id,
      header,
      sampleRows: sample.map((s) => s.raw),
      total_rows: totalRows,
    });
  } catch (error: any) {
    console.error("Import start error:", error);
    return NextResponse.json(
      { error: error?.message || "Import start failed" },
      { status: 500 }
    );
  }
}

