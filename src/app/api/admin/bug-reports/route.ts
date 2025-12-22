import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

const ALLOWED_SEVERITIES = new Set(["critical", "high", "all"]);
const ALLOWED_STATUSES = new Set(["open", "in_progress", "fixed", "verified", "active", "all"]);
const ALLOWED_AREAS = new Set(["sending", "followups", "payments", "dashboard", "onboarding", "all"]);

export async function GET(req: NextRequest) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const severity = (url.searchParams.get("severity") || "all").toLowerCase();
  const status = (url.searchParams.get("status") || "active").toLowerCase();
  const area = (url.searchParams.get("area") || "all").toLowerCase();
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit") || 200)));

  if (!ALLOWED_SEVERITIES.has(severity)) {
    return NextResponse.json({ error: "Invalid severity" }, { status: 400 });
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (!ALLOWED_AREAS.has(area)) {
    return NextResponse.json({ error: "Invalid area" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  let q = admin
    .from("bug_reports")
    .select("id, company_id, source, severity, area, description, status, created_at, fixed_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (severity !== "all") q = q.eq("severity", severity);
  if (status === "active") q = q.neq("status", "verified");
  else if (status !== "all") q = q.eq("status", status);
  if (area !== "all") q = q.eq("area", area);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  const status = String(body?.status || "").toLowerCase();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!ALLOWED_STATUSES.has(status) || status === "all" || status === "active") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("bug_reports")
    .update({ status })
    .eq("id", id)
    .select("id, company_id, source, severity, area, description, status, created_at, fixed_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ row: data });
}









