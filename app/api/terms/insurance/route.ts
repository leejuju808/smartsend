// Block 18800 — SmartSend Roofing Terminology Translator v1
// POST /api/terms/insurance
// Worker endpoint to categorize translations for insurance purposes

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

    let translations: any[] = [];

    if (translationId) {
      const { data } = await supabase
        .from("terminology_translations")
        .select("*")
        .eq("id", translationId);
      translations = data || [];
    } else if (contactId) {
      const { data } = await supabase
        .from("terminology_translations")
        .select("*")
        .eq("contact_id", contactId);
      translations = data || [];
    }

    const results = [];

    for (const translation of translations) {
      try {
        // Calculate insurance score based on category
        let insuranceScore = 0;
        
        switch (translation.insurance_category) {
          case "storm":
            insuranceScore = 85;
            break;
          case "emergency_leak":
            insuranceScore = 75;
            break;
          case "manufacturer_defect":
            insuranceScore = 60;
            break;
          case "improper_installation":
            insuranceScore = 50;
            break;
          case "wear_tear":
            insuranceScore = 20;
            break;
          case "aging":
            insuranceScore = 15;
            break;
          default:
            insuranceScore = 0;
        }

        // Boost score if storm connected
        if (translation.storm_connected) {
          insuranceScore = Math.min(insuranceScore + 15, 100);
        }

        // Update translation with insurance score
        const { error: updateError } = await supabase
          .from("terminology_translations")
          .update({
            insurance_category: translation.insurance_category,
            updated_at: new Date().toISOString(),
          })
          .eq("id", translation.id);

        // Update or create score record
        const { error: scoreError } = await supabase
          .from("terminology_scores")
          .upsert({
            translation_id: translation.id,
            contact_id: translation.contact_id,
            workspace_id: translation.workspace_id,
            insurance_score: insuranceScore,
            score_breakdown: {
              insurance_category: translation.insurance_category,
              storm_connected: translation.storm_connected,
            },
          }, {
            onConflict: "translation_id",
          });

        if (updateError || scoreError) {
          results.push({
            translationId: translation.id,
            success: false,
            error: updateError?.message || scoreError?.message,
          });
        } else {
          results.push({
            translationId: translation.id,
            success: true,
            insuranceCategory: translation.insurance_category,
            insuranceScore,
          });
        }
      } catch (err: any) {
        console.error(`Exception processing insurance for ${translation.id}:`, err);
        results.push({
          translationId: translation.id,
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
    console.error("Error in insurance categorization:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































