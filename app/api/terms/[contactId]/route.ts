// Block 18800 — SmartSend Roofing Terminology Translator v1
// GET /api/terms/{contactId}
// Get all terminology translations for a contact

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { contactId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contactId = params.contactId;

    if (!contactId) {
      return NextResponse.json(
        { error: "Contact ID is required" },
        { status: 400 }
      );
    }

    // Get translations for this contact
    const { data: translations, error: translationsError } = await supabase
      .from("terminology_translations")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false });

    if (translationsError) {
      console.error("Error fetching translations:", translationsError);
      return NextResponse.json(
        { error: translationsError.message },
        { status: 500 }
      );
    }

    // Get latest translation
    const latestTranslation = translations && translations.length > 0 
      ? translations[0] 
      : null;

    // Get scores for translations
    const translationIds = translations?.map((t) => t.id) || [];
    let scores: any[] = [];
    
    if (translationIds.length > 0) {
      const { data: scoresData } = await supabase
        .from("terminology_scores")
        .select("*")
        .in("translation_id", translationIds);
      
      scores = scoresData || [];
    }

    // Aggregate detected keywords across all translations
    const allKeywords = new Set<string>();
    const keywordCounts: Record<string, number> = {};
    
    translations?.forEach((translation) => {
      const keywords = translation.detected_keywords || [];
      keywords.forEach((keyword: string) => {
        allKeywords.add(keyword);
        keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
      });
    });

    // Get keyword explanations from latest translation
    const keywordExplanations = latestTranslation?.keyword_explanations || {};

    return NextResponse.json({
      ok: true,
      translations: translations || [],
      latestTranslation,
      scores,
      keywords: Array.from(allKeywords),
      keywordCounts,
      keywordExplanations,
      totalTranslations: translations?.length || 0,
    });
  } catch (error: any) {
    console.error("Error fetching terminology translations:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































