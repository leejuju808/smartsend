import { createClient } from "@/utils/supabase/server";

/**
 * Filter leads by segment definition filters
 * This function applies the filters from a segment_definition to get matching leads
 */
export async function filterLeadsBySegment(
  accountId: string,
  segmentDefinitionId: string
): Promise<any[]> {
  const supabase = createClient();

  // 1. Load segment definition
  const { data: segment, error: loadErr } = await supabase
    .from("segment_definitions")
    .select("*")
    .eq("id", segmentDefinitionId)
    .eq("account_id", accountId)
    .single();

  if (loadErr || !segment) {
    throw new Error("Segment definition not found");
  }

  const filters = segment.filters ?? [];

  // 2. Build dynamic query for leads
  // Check if we need to filter by score
  const scoreFilter = filters.find((f: any) => f.field === "lead_score");
  
  let query = supabase.from("leads").select("*").eq("account_id", accountId);

  // Handle lead_score filtering using a subquery
  if (scoreFilter) {
    let scoreQuery = supabase.from("lead_scores").select("lead_id");
    
    switch (scoreFilter.op) {
      case "=":
        scoreQuery = scoreQuery.eq("score", scoreFilter.value);
        break;
      case "!=":
        scoreQuery = scoreQuery.neq("score", scoreFilter.value);
        break;
      case ">=":
      case "gte":
        scoreQuery = scoreQuery.gte("score", scoreFilter.value);
        break;
      case "<=":
      case "lte":
        scoreQuery = scoreQuery.lte("score", scoreFilter.value);
        break;
      case "between":
        scoreQuery = scoreQuery
          .gte("score", scoreFilter.value.from)
          .lte("score", scoreFilter.value.to);
        break;
    }

    const { data: matchingScoreLeads } = await scoreQuery;
    const matchingLeadIds = matchingScoreLeads?.map((s: any) => s.lead_id) || [];
    
    if (matchingLeadIds.length > 0) {
      query = query.in("id", matchingLeadIds);
    } else {
      // No leads match the score filter
      return [];
    }
  }

  for (const f of filters) {
    // Skip lead_score as we handled it above
    if (f.field === "lead_score") {
      continue;
    }

    // Handle other fields
    switch (f.op) {
      case "=":
        query = query.eq(f.field, f.value);
        break;
      case "!=":
        query = query.neq(f.field, f.value);
        break;
      case "contains":
        query = query.ilike(f.field, `%${f.value}%`);
        break;
      case "starts_with":
        query = query.ilike(f.field, `${f.value}%`);
        break;
      case "in":
        query = query.in(f.field, f.value);
        break;
      case "between":
        query = query.gte(f.field, f.value.from).lte(f.field, f.value.to);
        break;
      default:
        console.warn("Unknown operator", f.op);
    }
  }

  // 3. Execute query
  const { data, error } = await query;

  if (error) {
    console.error("FILTER LEADS BY SEGMENT ERROR", error);
    throw new Error("Failed to filter leads by segment");
  }

  return data ?? [];
}












