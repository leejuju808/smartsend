import type { Group, Predicate } from "./schema";

export const and = (...nodes: (Group | Predicate)[]): Group => ({
  op: "AND",
  nodes,
});

export const or = (...nodes: (Group | Predicate)[]): Group => ({
  op: "OR",
  nodes,
});

export const p = (
  field: Predicate["field"],
  op: Predicate["op"],
  value: unknown
): Predicate => ({
  field,
  op,
  value,
});

export const icpSaaSHubspot50: Group = and(
  p("company_category", "eq", "SaaS"),
  p("tech_stack", "contains_any", ["HubSpot"]),
  p("company_employee_count", "gt", 50)
);


