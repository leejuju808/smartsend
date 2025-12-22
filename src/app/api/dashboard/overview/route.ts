import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc("dashboard_overview", { p_top: 5 });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Internal Error", { status: 500 });
  }
}