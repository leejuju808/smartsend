/**
 * Research Agent Token Support
 * Adds research-based personalization tokens to template rendering
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Fetch research data for a lead and return token values
 */
export async function getResearchTokens(leadId: string): Promise<Record<string, string>> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    const { data: research } = await supabase
      .from("research_cache")
      .select("*")
      .eq("lead_id", leadId)
      .single();

    if (!research) {
      return {};
    }

    // Extract personalization snippets (pick first one as default)
    const snippets = Array.isArray(research.personalization_snippets)
      ? research.personalization_snippets
      : [];
    const personalizationLine = snippets.length > 0 ? snippets[0] : "";

    // Extract tech stack note
    const techStack = Array.isArray(research.tech_stack) ? research.tech_stack : [];
    const techStackNote =
      techStack.length > 0
        ? `${techStack[0]}${techStack.length > 1 ? ` and ${techStack.length - 1} other${techStack.length > 2 ? "s" : ""}` : ""}`
        : "";

    // Extract competitor reference
    const competitors = Array.isArray(research.competitors) ? research.competitors : [];
    const competitorReference =
      competitors.length > 0 ? `competitors like ${competitors[0]}` : "";

    // Extract geo snippet
    const geoInfo = research.geographic_info || "";

    return {
      company_summary: research.company_summary || "",
      pain_point: research.pain_points || "",
      geo_snippet: geoInfo,
      personalization_line: personalizationLine,
      competitor_reference: competitorReference,
      tech_stack_note: techStackNote,
    };
  } catch (error) {
    console.error("Error fetching research tokens:", error);
    return {};
  }
}

/**
 * Merge research tokens into existing token context
 */
export function mergeResearchTokens(
  baseTokens: Record<string, string | null | undefined>,
  researchTokens: Record<string, string>
): Record<string, string | null | undefined> {
  return {
    ...baseTokens,
    ...researchTokens,
  };
}

/**
 * Enhanced token replacement that includes research tokens
 */
export function replaceResearchTokens(
  template: string,
  tokens: Record<string, string | null | undefined>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g, (_, key) => {
    const value = tokens[key];
    return value != null ? String(value) : "";
  });
}



