import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/cron/performance-health?key=...
 * Runs daily. Computes performance_health for all active companies and writes trend snapshot.
 */
export async function GET(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get("key");
    if (!key || key !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
    }

    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await sb.rpc("compute_performance_health_daily");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, processed: data ?? null });
  } catch (error: any) {
    console.error("Error in /api/cron/performance-health:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}









