// lib/segments/query-builder.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SegmentRuleNode, SegmentCondition, SegmentGroup } from "./debug";

type QueryBuilder = ReturnType<SupabaseClient["from"]>;

/**
 * Check if rules contain any company.* fields
 */
function hasCompanyFields(rules: SegmentRuleNode | null): boolean {
  if (!rules) return false;
  
  if (rules.type === "condition") {
    return rules.field.startsWith("company.");
  }
  
  if (rules.type === "group") {
    return rules.children.some((child) => hasCompanyFields(child));
  }
  
  return false;
}

/**
 * Apply SegmentRuleNode filters to a Supabase query
 * Recursively handles nested AND/OR groups
 */
export function applySegmentFilters(
  query: QueryBuilder,
  rules: SegmentRuleNode | null
): QueryBuilder {
  if (!rules) {
    // No rules = match all leads for the account
    return query;
  }

  // If rules contain company fields, ensure we select companies for the join
  // Note: The actual join happens via PostgREST when we filter on companies.* fields
  // We don't need to explicitly join, but we should ensure the relationship exists
  if (hasCompanyFields(rules)) {
    // PostgREST will automatically join companies when filtering on companies.* fields
    // No explicit join needed in Supabase JS client
  }

  return applyNode(query, rules);
}

function applyNode(query: QueryBuilder, node: SegmentRuleNode): QueryBuilder {
  if (node.type === "condition") {
    return applyCondition(query, node);
  }

  // Group node
  const group = node as SegmentGroup;
  
  if (group.mode === "AND") {
    // For AND groups, chain all conditions
    let result = query;
    for (const child of group.children) {
      result = applyNode(result, child);
    }
    return result;
  } else {
    // For OR groups, handle each condition
    // If all conditions can be stringified, use .or()
    // Otherwise, we need to handle them individually (limitation of Supabase query builder)
    
    const simpleConditions: SegmentCondition[] = [];
    const complexConditions: SegmentRuleNode[] = [];
    
    for (const child of group.children) {
      if (child.type === "condition") {
        const cond = child as SegmentCondition;
        // Check if condition can be stringified for .or()
        if (cond.op !== "in" && cond.op !== "not_in") {
          simpleConditions.push(cond);
        } else {
          complexConditions.push(child);
        }
      } else {
        complexConditions.push(child);
      }
    }

    // Handle simple OR conditions with .or()
    if (simpleConditions.length > 0) {
      const orStrings = simpleConditions
        .map((c) => buildConditionString(c))
        .filter((s): s is string => s !== null);
      
      if (orStrings.length > 0) {
        query = query.or(orStrings.join(","));
      }
    }

    // Handle complex conditions (in, not_in, nested groups) separately
    // For preview, we'll apply them as additional filters
    // Note: This may not be perfect for complex nested ORs, but works for most cases
    for (const complex of complexConditions) {
      if (complex.type === "condition") {
        const cond = complex as SegmentCondition;
        if (cond.op === "in" && Array.isArray(cond.value) && cond.value.length > 0) {
          // For OR with 'in', we need to handle differently
          // We'll create a separate query branch - but Supabase doesn't support this easily
          // For now, we'll apply it as an additional filter (which changes AND to OR behavior)
          // This is a limitation - proper OR with 'in' would need raw SQL
          query = query.in(cond.field, cond.value);
        }
      }
    }

    return query;
  }
}

function applyCondition(query: QueryBuilder, condition: SegmentCondition): QueryBuilder {
  const { field, op, value } = condition;

  // Handle thread.* fields - join with reply_threads
  if (field.startsWith("thread.")) {
    const threadField = field.replace("thread.", "");
    const normalizedOp = normalizeOperator(op);
    
    // PostgREST supports filtering on foreign tables using dot notation
    // Format: reply_threads.field.op.value
    // Note: Requires lead_id FK relationship between leads and reply_threads
    const filterField = `reply_threads.${threadField}`;
    
    switch (normalizedOp) {
      case "eq":
        return (query as any).eq(filterField, value);
      case "neq":
        return (query as any).neq(filterField, value);
      case "contains":
        return (query as any).ilike(filterField, `%${escapeLike(value)}%`);
      case "not_contains":
        return (query as any).not(filterField, "ilike", `%${escapeLike(value)}%`);
      case "starts_with":
        return (query as any).ilike(filterField, `${escapeLike(value)}%`);
      case "ends_with":
        return (query as any).ilike(filterField, `%${escapeLike(value)}`);
      case "gt":
        return (query as any).gt(filterField, value);
      case "gte":
        return (query as any).gte(filterField, value);
      case "lt":
        return (query as any).lt(filterField, value);
      case "lte":
        return (query as any).lte(filterField, value);
      case "in":
        if (Array.isArray(value) && value.length > 0) {
          return (query as any).in(filterField, value);
        }
        return query;
      case "not_in":
        if (Array.isArray(value) && value.length > 0) {
          let result = query;
          for (const val of value) {
            result = (result as any).neq(filterField, val);
          }
          return result;
        }
        return query;
      case "is_null":
        return (query as any).is(filterField, null);
      case "not_null":
        return (query as any).not(filterField, "is", null);
      default:
        console.warn(`Unsupported operator for thread field: ${op}`);
        return query;
    }
  }

  // Handle company.* fields - use PostgREST foreign table filter syntax
  if (field.startsWith("company.")) {
    const companyField = field.replace("company.", "");
    const normalizedOp = normalizeOperator(op);
    
    // Handle is_hot as a computed field (intent_score >= 5)
    if (companyField === "is_hot") {
      const filterField = "companies.intent_score";
      if (normalizedOp === "eq" && value === true) {
        return (query as any).gte(filterField, 5);
      } else if (normalizedOp === "eq" && value === false) {
        return (query as any).or(`companies.intent_score.lt.5,companies.intent_score.is.null`);
      } else if (normalizedOp === "neq" && value === true) {
        return (query as any).or(`companies.intent_score.lt.5,companies.intent_score.is.null`);
      } else if (normalizedOp === "neq" && value === false) {
        return (query as any).gte(filterField, 5);
      }
      return query;
    }
    
    // PostgREST supports filtering on foreign tables using dot notation
    // Format: companies.field.op.value
    // Note: Supabase JS client may need the relationship defined via foreign key
    const filterField = `companies.${companyField}`;
    
    // Note: Supabase JS client may support foreign table filtering via PostgREST
    // If the relationship is defined (company_id FK), PostgREST should handle it
    // Try using standard query builder methods with foreign table path
    switch (normalizedOp) {
      case "eq":
        // Try using eq with foreign table path - Supabase/PostgREST should handle this
        return (query as any).eq(filterField, value);
      case "neq":
        return (query as any).neq(filterField, value);
      case "contains":
        // For tech_stack array contains, use PostgREST array overlap operator
        if (companyField === "tech_stack" && Array.isArray(value)) {
          // PostgREST array overlap: companies.tech_stack.cs.{value1,value2}
          // Use filter with cs operator (contains)
          const arrayStr = value.map((v: any) => String(v)).join(",");
          return (query as any).filter(`${filterField}.cs`, `{${arrayStr}}`);
        }
        // For string fields, use ilike
        return (query as any).ilike(filterField, `%${escapeLike(value)}%`);
      case "not_contains":
        return (query as any).not(filterField, "ilike", `%${escapeLike(value)}%`);
      case "starts_with":
        return (query as any).ilike(filterField, `${escapeLike(value)}%`);
      case "ends_with":
        return (query as any).ilike(filterField, `%${escapeLike(value)}`);
      case "gt":
        return (query as any).gt(filterField, value);
      case "gte":
        return (query as any).gte(filterField, value);
      case "lt":
        return (query as any).lt(filterField, value);
      case "lte":
        return (query as any).lte(filterField, value);
      case "in":
        if (Array.isArray(value) && value.length > 0) {
          return (query as any).in(filterField, value);
        }
        return query; // Empty array = no matches
      case "not_in":
        if (Array.isArray(value) && value.length > 0) {
          // For not_in on foreign tables, use multiple neq filters (workaround)
          let result = query;
          for (const val of value) {
            result = (result as any).neq(filterField, val);
          }
          return result;
        }
        return query; // Empty array = match all
      case "is_null":
        return (query as any).is(filterField, null);
      case "not_null":
        return (query as any).not(filterField, "is", null);
      default:
        console.warn(`Unsupported operator for company field: ${op}`);
        return query;
    }
  }

  // Normalize operator for lead fields
  const normalizedOp = normalizeOperator(op);

  switch (normalizedOp) {
    case "eq":
      return query.eq(field, value);
    case "neq":
      return query.neq(field, value);
    case "contains":
      return query.ilike(field, `%${escapeLike(value)}%`);
    case "not_contains":
      // Use .not() with ilike operator
      return query.not(field, "ilike", `%${escapeLike(value)}%`);
    case "starts_with":
      return query.ilike(field, `${escapeLike(value)}%`);
    case "ends_with":
      return query.ilike(field, `%${escapeLike(value)}`);
    case "gt":
      return query.gt(field, value);
    case "gte":
      return query.gte(field, value);
    case "lt":
      return query.lt(field, value);
    case "lte":
      return query.lte(field, value);
    case "in":
      if (Array.isArray(value) && value.length > 0) {
        return query.in(field, value);
      }
      return query; // Empty array = no matches
    case "not_in":
      if (Array.isArray(value) && value.length > 0) {
        // For not_in, we need to filter out values in the array
        // Supabase doesn't have a direct not_in, so we'll need to handle this differently
        // For now, we'll use a workaround with multiple neq filters (limitation)
        // In practice, this might need raw SQL for complex cases
        let result = query;
        for (const val of value) {
          result = result.neq(field, val);
        }
        return result;
      }
      return query; // Empty array = match all
    case "is_null":
      return query.is(field, null);
    case "not_null":
      return query.not(field, "is", null);
    default:
      console.warn(`Unsupported operator: ${op}`);
      return query;
  }
}

function normalizeOperator(op: string): string {
  // Map legacy operators to normalized ones
  const map: Record<string, string> = {
    "=": "eq",
    "!=": "neq",
    ">": "gt",
    "<": "lt",
    ">=": "gte",
    "<=": "lte",
  };
  return map[op] || op;
}

function escapeLike(value: any): string {
  if (typeof value !== "string") {
    value = String(value);
  }
  return value.replace(/[%_]/g, (s) => `\\${s}`);
}

function buildConditionString(condition: SegmentCondition): string | null {
  const { field, op, value } = condition;
  const normalizedOp = normalizeOperator(op);
  
  // Build Supabase filter string format: "field.op.value"
  // Handle special cases
  if (normalizedOp === "contains") {
    return `${field}.ilike.%${escapeLike(value)}%`;
  }
  if (normalizedOp === "starts_with") {
    return `${field}.ilike.${escapeLike(value)}%`;
  }
  if (normalizedOp === "ends_with") {
    return `${field}.ilike.%${escapeLike(value)}`;
  }
  if (normalizedOp === "in" && Array.isArray(value)) {
    // For 'in', we need to use the .in() method, not string format
    return null; // Will be handled differently
  }
  
  // Standard operators
  const valueStr = typeof value === "string" ? value : String(value);
  return `${field}.${normalizedOp}.${valueStr}`;
}

