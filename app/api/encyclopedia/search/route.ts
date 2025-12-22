// Block 19400 — SmartSend Roofing Encyclopedia v1
// GET /api/encyclopedia/search
// Search the roofing encyclopedia

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("q");
    const category = searchParams.get("category");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    // Search encyclopedia using the function
    const { data: results, error } = await supabase.rpc(
      "search_roofing_encyclopedia",
      {
        p_query: query,
        p_category: category || null,
        p_limit: limit,
      }
    );

    if (error) {
      console.error("Error searching encyclopedia:", error);
      return NextResponse.json(
        { error: "Failed to search encyclopedia" },
        { status: 500 }
      );
    }

    // Enhance results with related data
    const enhancedResults = await Promise.all(
      (results || []).map(async (result: any) => {
        let relatedData = null;

        // Get related data based on category
        if (result.category === "component") {
          const { data: component } = await supabase
            .from("roofing_components")
            .select("*")
            .eq("component_name", result.term)
            .single();
          relatedData = component;
        } else if (result.category === "material") {
          const { data: material } = await supabase
            .from("roofing_materials")
            .select("*")
            .eq("material_name", result.term)
            .single();
          relatedData = material;
        } else if (result.category === "damage_type") {
          const { data: damage } = await supabase
            .from("roofing_damage_types")
            .select("*")
            .eq("damage_name", result.term)
            .single();
          relatedData = damage;
        } else if (result.category === "insurance_term") {
          const { data: insurance } = await supabase
            .from("roofing_insurance_terms")
            .select("*")
            .eq("term_name", result.term)
            .single();
          relatedData = insurance;
        } else if (result.category === "sales_term") {
          const { data: sales } = await supabase
            .from("roofing_sales_terms")
            .select("*")
            .eq("term_name", result.term)
            .single();
          relatedData = sales;
        }

        return {
          ...result,
          relatedData,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      query,
      category: category || null,
      results: enhancedResults,
      count: enhancedResults.length,
    });
  } catch (error: any) {
    console.error("Error in encyclopedia search:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































