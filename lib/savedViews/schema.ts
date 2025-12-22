import { z } from "zod";

export const Operator = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "like",
  "ilike",
  "contains_any",
  "contains_all",
]);

export const Predicate = z.object({
  field: z.enum([
    "company_category",
    "company_industry",
    "company_domain",
    "company_employee_count",
    "tech_stack",
    "role_title",
    "role_seniority",
  ]),
  op: Operator,
  value: z.any(),
});

export type Predicate = z.infer<typeof Predicate>;

type GroupShape = {
  op: "AND" | "OR";
  nodes: (Predicate | GroupShape)[];
};

export const Group: z.ZodType<GroupShape> = z.lazy(() =>
  z.object({
    op: z.enum(["AND", "OR"]),
    nodes: z.array(z.union([Predicate, Group])),
  })
);

export type Group = z.infer<typeof Group>;


