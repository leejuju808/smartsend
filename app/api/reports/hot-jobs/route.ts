import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { getHotJobsForReport } from "./getHotJobsForReport";

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Wrap in quotes and escape inner quotes
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const supabase = await getServerSupabase();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const orgId = await getCurrentOrgId();

  if (!orgId) {
    return new NextResponse("Missing org_id", { status: 400 });
  }

  const rows = await getHotJobsForReport(supabase, orgId);

  const headers = [
    "Job ID",
    "Homeowner",
    "Email",
    "Status",
    "Health Score",
    "Score Bucket",
    "Last Health Update",
    "Job Created At",
  ];

  const csvLines = [headers.map(toCsvValue).join(",")];

  for (const row of rows) {
    csvLines.push(
      [
        row.job_id,
        row.homeowner_name,
        row.homeowner_email,
        row.status,
        row.latest_score ?? 0,
        row.score_bucket ?? "",
        row.last_calculated_at,
        row.created_at,
      ]
        .map(toCsvValue)
        .join(",")
    );
  }

  const csv = csvLines.join("\n");

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `smartsend_hot_roofing_jobs_${dateStr}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}















































