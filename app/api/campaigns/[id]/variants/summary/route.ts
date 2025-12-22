import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const cid = params.id;

  // Try using the variant_stats view first
  const { data: viewData, error: viewError } = await supabase
    .from("variant_stats")
    .select("*")
    .eq("campaign_id", cid)
    .order("name", { ascending: true });

  if (!viewError && viewData) {
    return NextResponse.json({ variants: viewData || [] });
  }

  // Fallback to RPC function if view doesn't exist
  const { data, error } = await supabase.rpc("campaign_variant_stats_full", {
    cid: cid,
  });

  if (error) {
    console.error("Error fetching variant stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch variant stats", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ variants: data || [] });
}

