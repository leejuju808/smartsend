import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: campaign_id } = params;
    const supabase = createClient();

    const { data: variants, error } = await supabase
      .from("template_variants")
      .select("*")
      .eq("campaign_id", campaign_id)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching variants:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, variants: variants || [] });
  } catch (error: any) {
    console.error("Error in list variants route:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}










