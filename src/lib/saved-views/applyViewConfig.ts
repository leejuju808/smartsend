import { SavedView } from "@/hooks/useSavedViews";

/**
 * Apply a saved view's configuration to a Supabase query builder
 */
export function applyViewConfigToQuery(
  query: any,
  view: SavedView | null
): any {
  if (!view || !view.config) {
    return query;
  }

  let q = query;
  const { filters = [], sort = [], hiddenColumns = [] } = view.config;

  // Apply filters
  for (const filter of filters) {
    const { field, operator, value } = filter;

    switch (operator) {
      case "=":
        q = q.eq(field, value);
        break;
      case "!=":
      case "<>":
        q = q.neq(field, value);
        break;
      case ">":
        q = q.gt(field, value);
        break;
      case ">=":
        q = q.gte(field, value);
        break;
      case "<":
        q = q.lt(field, value);
        break;
      case "<=":
        q = q.lte(field, value);
        break;
      case "contains":
      case "like":
        q = q.ilike(field, `%${value}%`);
        break;
      case "in":
        if (Array.isArray(value)) {
          q = q.in(field, value);
        }
        break;
      case "not_in":
        if (Array.isArray(value)) {
          q = q.not("in", field, value);
        }
        break;
      case "is_null":
        q = q.is(field, null);
        break;
      case "is_not_null":
        q = q.not("is", field, null);
        break;
      default:
        console.warn(`Unknown filter operator: ${operator}`);
    }
  }

  // Apply sorting
  if (sort.length > 0) {
    const primarySort = sort[0];
    q = q.order(primarySort.field, {
      ascending: primarySort.direction === "asc",
    });

    // Apply additional sorts if needed
    for (let i = 1; i < sort.length; i++) {
      const s = sort[i];
      q = q.order(s.field, {
        ascending: s.direction === "asc",
        nullsFirst: false,
      });
    }
  }

  return q;
}

/**
 * Get hidden columns from a saved view
 */
export function getHiddenColumns(view: SavedView | null): string[] {
  if (!view || !view.config) {
    return [];
  }
  return view.config.hiddenColumns || [];
}



