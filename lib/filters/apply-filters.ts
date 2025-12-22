import { FilterState } from "@/components/filters/filter-builder";

/**
 * Apply saved filter state to a Supabase query builder
 * This function modifies the query in place based on the filter state
 */
export function applyFiltersToQuery(
  query: any,
  filter: FilterState,
  context: "inbox" | "leads" | "pipeline" | "campaigns"
): any {
  let q = query;

  // Tags filter (for leads/pipeline contexts)
  if (filter.tags && filter.tags.length > 0) {
    if (context === "leads" || context === "pipeline") {
      // For leads, tags are stored as an array column or in a junction table
      // Assuming tags is a jsonb array column: tags @> '["tag1", "tag2"]'
      // Or if using junction table, we'd need to join
      // For now, using contains operator for array columns
      filter.tags.forEach((tagId) => {
        q = q.contains("tags", [tagId]);
      });
    }
  }

  // Stage filter
  if (filter.stage_id) {
    if (context === "leads" || context === "pipeline") {
      q = q.eq("stage_id", filter.stage_id);
      // Also check pipeline_stage column if it exists
      q = q.or(`stage_id.eq.${filter.stage_id},pipeline_stage.eq.${filter.stage_id}`);
    }
  }

  // Intent filter (for inbox context)
  if (filter.intent) {
    if (context === "inbox") {
      q = q.eq("last_ai_intent", filter.intent);
      // Also check intent_primary if it exists
      q = q.or(`last_ai_intent.eq.${filter.intent},intent_primary.eq.${filter.intent}`);
    }
  }

  // Open count filter
  if (filter.opened_min !== undefined && filter.opened_min > 0) {
    if (context === "leads" || context === "campaigns") {
      q = q.gte("open_count", filter.opened_min);
    }
  }

  // Replied filter
  if (filter.replied !== undefined) {
    if (context === "inbox") {
      if (filter.replied) {
        q = q.not("replied_at", "is", null);
      } else {
        q = q.is("replied_at", null);
      }
    } else if (context === "leads" || context === "pipeline") {
      if (filter.replied) {
        q = q.eq("status", "replied");
        q = q.or(`status.eq.replied,replied_at.not.is.null`);
      } else {
        q = q.neq("status", "replied");
        q = q.is("replied_at", null);
      }
    }
  }

  // Clicked filter
  if (filter.clicked !== undefined) {
    if (context === "leads" || context === "campaigns") {
      if (filter.clicked) {
        q = q.gte("click_count", 1);
      } else {
        q = q.or("click_count.is.null,click_count.eq.0");
      }
    }
  }

  // Has LinkedIn filter
  if (filter.has_linkedin !== undefined) {
    if (context === "leads" || context === "pipeline") {
      if (filter.has_linkedin) {
        q = q.not("linkedin_url", "is", null);
      } else {
        q = q.is("linkedin_url", null);
      }
    }
  }

  // No reply in X days filter
  if (filter.no_reply_days !== undefined && filter.no_reply_days > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filter.no_reply_days);
    const cutoffISO = cutoffDate.toISOString();

    if (context === "inbox") {
      // Last message was before cutoff and no reply
      q = q.lte("last_message_at", cutoffISO);
      q = q.is("replied_at", null);
    } else if (context === "leads" || context === "pipeline") {
      // Last contact was before cutoff and no reply
      q = q.lte("last_contacted_at", cutoffISO);
      q = q.is("replied_at", null);
    }
  }

  // Score bucket filter (hot, warm, cool, cold)
  if (filter.score_bucket) {
    if (context === "leads" || context === "pipeline" || context === "inbox") {
      q = q.eq("score_bucket", filter.score_bucket);
    }
  }

  // Score minimum filter
  if (filter.score_min !== undefined && filter.score_min > 0) {
    if (context === "leads" || context === "pipeline" || context === "inbox") {
      q = q.gte("score", filter.score_min);
    }
  }

  // Score v2 minimum filter
  if ((filter as any).score_v2_min !== undefined && (filter as any).score_v2_min > 0) {
    if (context === "leads" || context === "pipeline" || context === "inbox") {
      q = q.gte("score_v2", (filter as any).score_v2_min);
    }
  }

  // Score v2 bucket filter
  if ((filter as any).score_v2_bucket) {
    if (context === "leads" || context === "pipeline" || context === "inbox") {
      // Calculate bucket from score_v2
      // hot: >= 75, warm: 50-74, cool: 20-49, cold: < 20
      const bucket = (filter as any).score_v2_bucket;
      if (bucket === "hot") {
        q = q.gte("score_v2", 75);
      } else if (bucket === "warm") {
        q = q.gte("score_v2", 50).lt("score_v2", 75);
      } else if (bucket === "cool") {
        q = q.gte("score_v2", 20).lt("score_v2", 50);
      } else if (bucket === "cold") {
        q = q.lt("score_v2", 20);
      }
    }
  }

  return q;
}

/**
 * Apply filters for Inbox context (inbox_threads table)
 */
export function applyInboxFilters(query: any, filter: FilterState): any {
  let q = query;

  if (filter.intent) {
    q = q.eq("last_ai_intent", filter.intent);
  }

  if (filter.replied !== undefined) {
    if (filter.replied) {
      q = q.not("replied_at", "is", null);
    } else {
      q = q.is("replied_at", null);
    }
  }

  if (filter.no_reply_days !== undefined && filter.no_reply_days > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filter.no_reply_days);
    q = q.lte("last_message_at", cutoffDate.toISOString());
    q = q.is("replied_at", null);
  }

  // Score bucket filter
  if (filter.score_bucket) {
    q = q.eq("score_bucket", filter.score_bucket);
  }

  // Score minimum filter
  if (filter.score_min !== undefined && filter.score_min > 0) {
    q = q.gte("score", filter.score_min);
  }

  // Score v2 minimum filter
  if ((filter as any).score_v2_min !== undefined && (filter as any).score_v2_min > 0) {
    q = q.gte("score_v2", (filter as any).score_v2_min);
  }

  // Score v2 bucket filter
  if ((filter as any).score_v2_bucket) {
    const bucket = (filter as any).score_v2_bucket;
    if (bucket === "hot") {
      q = q.gte("score_v2", 75);
    } else if (bucket === "warm") {
      q = q.gte("score_v2", 50).lt("score_v2", 75);
    } else if (bucket === "cool") {
      q = q.gte("score_v2", 20).lt("score_v2", 50);
    } else if (bucket === "cold") {
      q = q.lt("score_v2", 20);
    }
  }

  return q;
}

/**
 * Apply filters for Leads context (leads table)
 */
export function applyLeadsFilters(query: any, filter: FilterState): any {
  let q = query;

  if (filter.tags && filter.tags.length > 0) {
    // Assuming tags is stored as jsonb array
    filter.tags.forEach((tagId) => {
      q = q.contains("tags", [tagId]);
    });
  }

  if (filter.stage_id) {
    q = q.or(`stage_id.eq.${filter.stage_id},pipeline_stage.eq.${filter.stage_id}`);
  }

  if (filter.opened_min !== undefined && filter.opened_min > 0) {
    q = q.gte("open_count", filter.opened_min);
  }

  if (filter.replied !== undefined) {
    if (filter.replied) {
      q = q.or(`status.eq.replied,replied_at.not.is.null`);
    } else {
      q = q.and(`status.neq.replied,replied_at.is.null`);
    }
  }

  if (filter.clicked !== undefined) {
    if (filter.clicked) {
      q = q.gte("click_count", 1);
    } else {
      q = q.or("click_count.is.null,click_count.eq.0");
    }
  }

  if (filter.has_linkedin !== undefined) {
    if (filter.has_linkedin) {
      q = q.not("linkedin_url", "is", null);
    } else {
      q = q.is("linkedin_url", null);
    }
  }

  if (filter.no_reply_days !== undefined && filter.no_reply_days > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filter.no_reply_days);
    q = q.lte("last_contacted_at", cutoffDate.toISOString());
    q = q.is("replied_at", null);
  }

  // Score bucket filter
  if (filter.score_bucket) {
    q = q.eq("score_bucket", filter.score_bucket);
  }

  // Score minimum filter
  if (filter.score_min !== undefined && filter.score_min > 0) {
    q = q.gte("score", filter.score_min);
  }

  // Score v2 minimum filter
  if ((filter as any).score_v2_min !== undefined && (filter as any).score_v2_min > 0) {
    q = q.gte("score_v2", (filter as any).score_v2_min);
  }

  // Score v2 bucket filter
  if ((filter as any).score_v2_bucket) {
    const bucket = (filter as any).score_v2_bucket;
    if (bucket === "hot") {
      q = q.gte("score_v2", 75);
    } else if (bucket === "warm") {
      q = q.gte("score_v2", 50).lt("score_v2", 75);
    } else if (bucket === "cool") {
      q = q.gte("score_v2", 20).lt("score_v2", 50);
    } else if (bucket === "cold") {
      q = q.lt("score_v2", 20);
    }
  }

  return q;
}

/**
 * Apply filters for Pipeline context (similar to leads)
 */
export function applyPipelineFilters(query: any, filter: FilterState): any {
  return applyLeadsFilters(query, filter);
}

/**
 * Apply filters for Campaigns context
 */
export function applyCampaignsFilters(query: any, filter: FilterState): any {
  let q = query;

  if (filter.opened_min !== undefined && filter.opened_min > 0) {
    q = q.gte("open_count", filter.opened_min);
  }

  if (filter.clicked !== undefined) {
    if (filter.clicked) {
      q = q.gte("click_count", 1);
    } else {
      q = q.or("click_count.is.null,click_count.eq.0");
    }
  }

  return q;
}

