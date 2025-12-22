// Block 18800 — SmartSend Roofing Terminology Translator v1
// POST /api/terms/score
// Worker endpoint to recalculate terminology scores

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { translationId, contactId } = body;

    if (!translationId && !contactId) {
      return NextResponse.json(
        { error: "translationId or contactId is required" },
        { status: 400 }
      );
    }

    let translationIds: string[] = [];

    if (translationId) {
      translationIds = [translationId];
    } else if (contactId) {
      // Get all translations for this contact
      const { data: translations } = await supabase
        .from("terminology_translations")
        .select("id")
        .eq("contact_id", contactId);
      
      translationIds = translations?.map((t) => t.id) || [];
    }

    const results = [];

    for (const tid of translationIds) {
      try {
        // Call the database function to recalculate severity score
        const { data, error } = await supabase.rpc(
          "calculate_terminology_severity_score",
          { p_translation_id: tid }
        );

        if (error) {
          console.error(`Error calculating score for ${tid}:`, error);
          results.push({
            translationId: tid,
            success: false,
            error: error.message,
          });
        } else {
          results.push({
            translationId: tid,
            success: true,
            severityScore: data,
          });
        }
      } catch (err: any) {
        console.error(`Exception calculating score for ${tid}:`, err);
        results.push({
          translationId: tid,
          success: false,
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      processed: results.length,
    });
  } catch (error: any) {
    console.error("Error in terminology scoring:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































