import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EXPORT_LIMIT = 5000;
const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "account_id",
  "campaign_id",
  "actor_user_id",
  "actor_role",
  "action",
  "entity_type",
  "entity_id",
  "entity_name",
  "details",
] as const;

function escapeCsv(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (/["\n,]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: Request) {
  const supabase = createClient();
  const params = new URL(req.url).searchParams;

  let query = supabase
    .from("v_activity_export")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(EXPORT_LIMIT);

  const campaignId = params.get("campaignId");
  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []).map((row: Record<string, unknown>) =>
    EXPORT_COLUMNS.map((column) => escapeCsv(row[column])).join(","),
  );

  const body = [EXPORT_COLUMNS.join(","), ...rows].join("\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=audit_export.csv",
    },
  });
}




