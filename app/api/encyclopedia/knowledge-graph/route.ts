// Block 19400 — SmartSend Roofing Encyclopedia v1
// GET /api/encyclopedia/knowledge-graph
// Get knowledge graph (related terms) for a term

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
    const termId = searchParams.get("termId");
    const term = searchParams.get("term");
    const depth = parseInt(searchParams.get("depth") || "2");

    if (!termId && !term) {
      return NextResponse.json(
        { error: "Either 'termId' or 'term' parameter is required" },
        { status: 400 }
      );
    }

    let finalTermId = termId;

    // If term provided, find the ID
    if (!finalTermId && term) {
      const { data: encyclopedia } = await supabase
        .from("roofing_encyclopedia")
        .select("id")
        .eq("term", term)
        .single();

      if (!encyclopedia) {
        return NextResponse.json(
          { error: "Term not found" },
          { status: 404 }
        );
      }

      finalTermId = encyclopedia.id;
    }

    // Get knowledge graph
    const { data: graph, error } = await supabase.rpc(
      "get_roofing_knowledge_graph",
      {
        p_term_id: finalTermId,
        p_depth: depth,
      }
    );

    if (error) {
      console.error("Error getting knowledge graph:", error);
      // Fallback: get related terms from encyclopedia
      const { data: termData } = await supabase
        .from("roofing_encyclopedia")
        .select("related_terms")
        .eq("id", finalTermId)
        .single();

      const relatedTermIds = termData?.related_terms || [];

      if (relatedTermIds.length > 0) {
        const { data: relatedTerms } = await supabase
          .from("roofing_encyclopedia")
          .select("*")
          .in("id", relatedTermIds);

        return NextResponse.json({
          ok: true,
          termId: finalTermId,
          graph: relatedTerms?.map((t) => ({
            term_id: t.id,
            term: t.term,
            category: t.category,
            relationship_type: "related",
            depth: 1,
          })) || [],
        });
      }

      return NextResponse.json({
        ok: true,
        termId: finalTermId,
        graph: [],
      });
    }

    // Enhance graph with full data
    const enhancedGraph = await Promise.all(
      (graph || []).map(async (node: any) => {
        const { data: encyclopedia } = await supabase
          .from("roofing_encyclopedia")
          .select("*")
          .eq("id", node.term_id)
          .single();

        return {
          ...node,
          encyclopedia,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      termId: finalTermId,
      depth,
      graph: enhancedGraph,
    });
  } catch (error: any) {
    console.error("Error in knowledge graph:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































