// Block 15400 — Import Engine v2 Upload + Smart Mapping
// POST /api/contacts/import/upload
// Accepts CSV file, parses headers + sample rows, returns preview + smart mappings + import_session_id

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parse } from "csv-parse/sync";
import { generateSmartMappings } from "@/lib/import/smart-column-mapping";
import { calculateImportStats, calculateDangerScore, detectBoughtList } from "@/lib/import/danger-score";

export const runtime = "nodejs"; // to handle file buffer

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const sourceType = formData.get("source_type") as string | null; // Optional preset

  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  // Find workspace - get first workspace membership
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;

  const buffer = Buffer.from(await file.arrayBuffer());
  const content = buffer.toString("utf8");

  let records: any[] = [];
  try {
    records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to parse CSV: " + err.message },
      { status: 400 }
    );
  }

  if (!records.length) {
    return NextResponse.json({ error: "CSV has no rows" }, { status: 400 });
  }

  const headers = Object.keys(records[0]);
  const sampleRows = records.slice(0, 100); // Use first 100 rows for analysis
  const previewRows = records.slice(0, 10); // First 10 for UI preview

  // Generate smart column mappings
  const mappingResult = generateSmartMappings(headers, sampleRows);
  
  // Calculate initial danger score
  const stats = calculateImportStats(sampleRows, mappingResult.mappings);
  const emailField = Object.keys(mappingResult.mappings).find(
    (col) => mappingResult.mappings[col] === 'email'
  );
  const looksLikeBoughtList = emailField ? detectBoughtList(sampleRows, emailField) : false;
  
  const dangerScore = calculateDangerScore({
    missingEmailPct: stats.missingEmailPct,
    invalidEmailPct: stats.invalidEmailPct,
    duplicatePct: stats.duplicatePct,
    looksLikeBoughtList,
  });

  // Create import session
  const { data: session, error: sessionError } = await supabase
    .from("import_sessions")
    .insert({
      workspace_id: workspaceId,
      file_name: file.name,
      total_rows: records.length,
      status: "pending",
      column_mapping: mappingResult.mappings,
      danger_score: dangerScore.level,
    })
    .select("id")
    .single();

  if (sessionError) {
    return NextResponse.json(
      { error: sessionError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    session_id: session.id,
    headers,
    preview_rows: previewRows,
    mappings: mappingResult.mappings,
    mapping_confidence: mappingResult.confidence,
    suggestions: mappingResult.suggestions,
    danger_score: {
      level: dangerScore.level,
      score: dangerScore.score,
      reasons: dangerScore.reasons,
      recommendations: dangerScore.recommendations,
    },
    stats: {
      total_rows: records.length,
      ...stats,
    },
  });
}







