// lib/templates/rewrite-schema.ts

import { z } from "zod";

export const rewritePresetConfigSchema = z.object({
  mode: z.enum(["shorter", "longer", "warmer", "more_direct", "clearer", "custom"]),
  tone: z.enum(["neutral", "friendly", "casual", "formal", "assertive", "playful"]),
  max_words: z.number().int().positive().max(1000).optional(),
  instructions: z.string().min(1),
});

export const rewritePresetSchema = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  config: rewritePresetConfigSchema,
});

export type RewritePresetConfig = z.infer<typeof rewritePresetConfigSchema>;
export type RewritePresetInput = z.infer<typeof rewritePresetSchema>;













