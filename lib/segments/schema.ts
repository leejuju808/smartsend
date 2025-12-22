// lib/segments/schema.ts

import { z } from "zod";

export const conditionSchema = z.object({
  field: z.string(), // e.g. "email", "company", "title", "city", "country", "tags"
  op: z.enum(["=", "!=", "contains", ">", "<"]),
  value: z.union([z.string(), z.number()]),
});

export const segmentSchema = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  conditions: z.array(conditionSchema).min(1, "Add at least one condition"),
});

export type SegmentCondition = z.infer<typeof conditionSchema>;
export type SegmentInput = z.infer<typeof segmentSchema>;













