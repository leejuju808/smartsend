import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

/**
 * Query params:
 * {
 *   step_id: uuid,
 * }
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const step_id = searchParams.get("step_id");

    if (!step_id) {
      return NextResponse.json({ error: "step_id is required" }, { status: 400 });
    }

    const sb = createClient(url, service, { auth: { persistSession: false } });

    const { data, error } = await sb
      .from("campaign_step_variants")
      .select("*")
      .eq("step_id", step_id)
      .order("variant_key", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [], error: null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "List variants failed" }, { status: 500 });
  }
}



