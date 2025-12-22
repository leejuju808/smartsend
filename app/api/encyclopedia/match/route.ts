// Block 19400 — SmartSend Roofing Encyclopedia v1
// POST /api/encyclopedia/match
// Match a term from input text (fuzzy matching)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { text, category } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    // Match term using the function
    const { data: matches, error } = await supabase.rpc("match_roofing_term", {
      p_input_text: text,
      p_category: category || null,
    });

    if (error) {
      console.error("Error matching term:", error);
      return NextResponse.json(
        { error: "Failed to match term" },
        { status: 500 }
      );
    }

    // Enhance matches with full data
    const enhancedMatches = await Promise.all(
      (matches || []).map(async (match: any) => {
        let fullData = null;

        // Get full data based on category
        const { data: encyclopedia } = await supabase
          .from("roofing_encyclopedia")
          .select("*")
          .eq("id", match.term_id)
          .single();

        if (encyclopedia) {
          if (encyclopedia.category === "component") {
            const { data: component } = await supabase
              .from("roofing_components")
              .select("*")
              .eq("component_name", match.term)
              .single();
            fullData = component;
          } else if (encyclopedia.category === "material") {
            const { data: material } = await supabase
              .from("roofing_materials")
              .select("*")
              .eq("material_name", match.term)
              .single();
            fullData = material;
          } else if (encyclopedia.category === "damage_type") {
            const { data: damage } = await supabase
              .from("roofing_damage_types")
              .select("*")
              .eq("damage_name", match.term)
              .single();
            fullData = damage;
          } else if (encyclopedia.category === "insurance_term") {
            const { data: insurance } = await supabase
              .from("roofing_insurance_terms")
              .select("*")
              .eq("term_name", match.term)
              .single();
            fullData = insurance;
          } else if (encyclopedia.category === "sales_term") {
            const { data: sales } = await supabase
              .from("roofing_sales_terms")
              .select("*")
              .eq("term_name", match.term)
              .single();
            fullData = sales;
          }
        }

        return {
          ...match,
          encyclopedia,
          fullData,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      input: text,
      matches: enhancedMatches,
      bestMatch: enhancedMatches[0] || null,
    });
  } catch (error: any) {
    console.error("Error in term matching:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































